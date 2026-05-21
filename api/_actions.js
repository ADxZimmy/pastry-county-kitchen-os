export function id(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function bool(value) {
  return value === true || value === "true" || value === "Yes";
}

export function required(value, label) {
  if (value === undefined || value === null || String(value).trim() === "") {
    throw Object.assign(new Error(`${label} is required.`), { statusCode: 400 });
  }
  return String(value).trim();
}

function normalizeUnit(unit, fallback = "g") {
  return String(unit || fallback);
}

const movementTypes = new Set(["purchase", "production_use", "reservation", "reservation_release", "adjustment", "waste", "return", "correction"]);

function nonNegative(value, label) {
  if (value < 0) {
    throw Object.assign(new Error(`${label} cannot be negative.`), { statusCode: 400 });
  }
  return value;
}

function positive(value, label) {
  if (value <= 0) {
    throw Object.assign(new Error(`${label} must be greater than zero.`), { statusCode: 400 });
  }
  return value;
}

async function requirementsForOrder(sql, orderId) {
  return sql`
    select ri.ingredient_id, ri.unit, sum(ri.quantity * oi.requested_yield_quantity / r.base_yield_quantity * oi.quantity_multiplier) as quantity
    from order_items oi
    join recipes r on r.id = oi.recipe_id
    join recipe_items ri on ri.recipe_id = r.id
    where oi.order_id = ${orderId}
    group by ri.ingredient_id, ri.unit
  `;
}

async function stockStatusForRequirements(sql, requirements) {
  if (!requirements.length) return "In Stock";
  const statuses = await Promise.all(requirements.map(async (item) => {
    const rows = await sql`
      select current_stock::float as current_stock, reserved_stock::float as reserved_stock
      from ingredients
      where id = ${item.ingredient_id}
    `;
    const ingredient = rows[0];
    const available = Number(ingredient?.current_stock ?? 0) - Number(ingredient?.reserved_stock ?? 0);
    return available >= Number(item.quantity) ? "In Stock" : "Shortage";
  }));
  return statuses.includes("Shortage") ? "Shortage" : "In Stock";
}

async function reserveOrder(sql, orderId) {
  const orderRows = await sql`select status from orders where id = ${orderId}`;
  if (!orderRows.length) throw Object.assign(new Error("Order not found."), { statusCode: 404 });
  if (["Produced", "Delivered", "Cancelled"].includes(orderRows[0].status)) {
    return { reserved: false, alreadyFinal: true };
  }

  const requirements = await requirementsForOrder(sql, orderId);
  const reservations = await reservationBalancesForOrder(sql, orderId);
  const plan = await Promise.all(requirements.map(async (item) => {
    const ingredientRows = await sql`
      select current_stock::float as current_stock, reserved_stock::float as reserved_stock
      from ingredients
      where id = ${item.ingredient_id}
    `;
    const ingredient = ingredientRows[0];
    const requiredQuantity = Number(item.quantity);
    const alreadyReserved = reservations.get(`${item.ingredient_id}:${item.unit}`) ?? 0;
    const remainingRequired = Math.max(0, requiredQuantity - alreadyReserved);
    const availableStock = Math.max(0, Number(ingredient?.current_stock ?? 0) - Number(ingredient?.reserved_stock ?? 0));
    const reserveQuantity = Math.min(remainingRequired, availableStock);
    return {
      ingredientId: item.ingredient_id,
      unit: item.unit,
      requiredQuantity,
      alreadyReserved,
      reserveQuantity,
      shortageQuantity: Math.max(0, remainingRequired - reserveQuantity)
    };
  }));
  const reservationsToCreate = plan.filter((item) => item.reserveQuantity > 0);
  const shortages = plan.filter((item) => item.shortageQuantity > 0);
  const isComplete = shortages.length === 0;

  if (reservationsToCreate.length) {
    await sql.transaction((txn) => [
      ...reservationsToCreate.flatMap((item, index) => [
        txn`
          insert into inventory_movements (id, ingredient_id, movement_type, quantity_change, unit, related_order_id, note, created_by)
          values (${id(`mov-res-${index}`)}, ${item.ingredientId}, 'reservation', ${item.reserveQuantity}, ${item.unit}, ${orderId}, ${isComplete ? "Reserved stock for confirmed order" : "Partially reserved available stock for confirmed order"}, 'system')
        `,
        txn`
          update ingredients
          set reserved_stock = reserved_stock + ${item.reserveQuantity}, updated_at = now()
          where id = ${item.ingredientId}
        `
      ]),
      txn`
        update orders
        set status = ${isComplete ? "Stock Reserved" : orderRows[0].status},
          stock_status = ${isComplete ? "Reserved" : "Shortage"},
          production_status = ${isComplete ? "Ready" : orderRows[0].production_status ?? "Not Started"},
          updated_at = now()
        where id = ${orderId}
      `
    ]);
  } else {
    await sql`
      update orders
      set status = ${isComplete ? "Stock Reserved" : orderRows[0].status},
        stock_status = ${isComplete ? "Reserved" : "Shortage"},
        production_status = ${isComplete ? "Ready" : orderRows[0].production_status ?? "Not Started"},
        updated_at = now()
      where id = ${orderId}
    `;
  }

  return {
    reserved: isComplete,
    partial: reservationsToCreate.length > 0 && !isComplete,
    alreadyReserved: reservationsToCreate.length === 0 && isComplete,
    shortage: !isComplete,
    reservedLines: reservationsToCreate,
    shortages
  };
}

async function ensureOperationalTables(sql) {
  await sql`alter table orders add column if not exists archived boolean not null default false`;
  await sql`alter table suppliers add column if not exists default_currency text not null default 'NGN'`;
  await sql`alter table suppliers add column if not exists lead_time_days integer not null default 2`;
  await sql`alter table suppliers add column if not exists supplied_ingredient_ids text[] not null default '{}'`;
  await sql`alter table suppliers add column if not exists active boolean not null default true`;
  await sql`alter table conversion_rules add column if not exists active boolean not null default true`;
  await sql`alter table settings add column if not exists safety_margin_percentage numeric(6,3) not null default 10`;
  await sql`alter table settings add column if not exists default_tax_percentage numeric(6,3) not null default 0`;
  await sql`alter table settings add column if not exists low_stock_notification_email text`;
  await sql`
    create table if not exists ingredient_batches (
      id text primary key,
      ingredient_id text not null references ingredients(id),
      purchase_id text references purchase_logs(id),
      quantity_received numeric(14,3) not null default 0,
      quantity_remaining numeric(14,3) not null default 0,
      unit text not null,
      expiry_date date,
      received_date date not null default current_date,
      notes text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists audit_logs (
      id text primary key,
      entity_type text not null,
      entity_id text not null,
      action text not null,
      before_data jsonb,
      after_data jsonb,
      actor text not null default 'system',
      created_at timestamptz not null default now()
    )
  `;
}

async function audit(sql, entityType, entityId, action, beforeData, afterData) {
  await sql`
    insert into audit_logs (id, entity_type, entity_id, action, before_data, after_data, actor)
    values (${id("audit")}, ${entityType}, ${entityId}, ${action}, ${beforeData ? JSON.stringify(beforeData) : null}, ${afterData ? JSON.stringify(afterData) : null}, 'system')
  `;
}

async function rowById(sql, table, entityId) {
  if (table === "ingredients") return (await sql`select * from ingredients where id = ${entityId}`)[0] ?? null;
  if (table === "suppliers") return (await sql`select * from suppliers where id = ${entityId}`)[0] ?? null;
  if (table === "recipes") return (await sql`select * from recipes where id = ${entityId}`)[0] ?? null;
  if (table === "orders") return (await sql`select * from orders where id = ${entityId}`)[0] ?? null;
  if (table === "conversion_rules") return (await sql`select * from conversion_rules where id = ${entityId}`)[0] ?? null;
  if (table === "settings") return (await sql`select * from settings where id = ${entityId}`)[0] ?? null;
  return null;
}

function createBatchFromPurchase(txn, item) {
  return txn`
    insert into ingredient_batches (id, ingredient_id, purchase_id, quantity_received, quantity_remaining, unit, expiry_date, notes)
    values (${id("batch")}, ${item.ingredientId}, ${item.purchaseId}, ${item.quantity}, ${item.quantity}, ${item.unit}, ${item.expiryDate || null}, ${item.note || "Purchased stock lot"})
  `;
}

async function batchDeductionsForRequirement(sql, requirement) {
  let remaining = Number(requirement.quantity);
  const batches = await sql`
    select id, quantity_remaining::float as quantity_remaining
    from ingredient_batches
    where ingredient_id = ${requirement.ingredient_id}
      and unit = ${requirement.unit}
      and quantity_remaining > 0
    order by expiry_date nulls last, received_date, created_at
  `;
  return batches.flatMap((batch) => {
    if (remaining <= 0) return [];
    const take = Math.min(remaining, Number(batch.quantity_remaining));
    remaining -= take;
    return [{ batchId: batch.id, quantity: take }];
  });
}

async function releaseReservation(sql, orderId) {
  const reservations = await sql`
    select ingredient_id, unit, sum(quantity_change)::float as quantity
    from inventory_movements
    where related_order_id = ${orderId} and movement_type = 'reservation'
    group by ingredient_id, unit
  `;
  const releases = await sql`
    select ingredient_id, unit, sum(abs(quantity_change))::float as quantity
    from inventory_movements
    where related_order_id = ${orderId} and movement_type = 'reservation_release'
    group by ingredient_id, unit
  `;
  const released = new Map(releases.map((row) => [`${row.ingredient_id}:${row.unit}`, Number(row.quantity)]));
  const pending = reservations
    .map((row) => ({ ...row, quantity: Math.max(0, Number(row.quantity) - (released.get(`${row.ingredient_id}:${row.unit}`) ?? 0)) }))
    .filter((row) => row.quantity > 0);

  if (!pending.length) return { released: false };
  await sql.transaction((txn) => pending.flatMap((item, index) => [
    txn`
      insert into inventory_movements (id, ingredient_id, movement_type, quantity_change, unit, related_order_id, note, created_by)
      values (${id(`mov-rel-${index}`)}, ${item.ingredient_id}, 'reservation_release', ${-item.quantity}, ${item.unit}, ${orderId}, 'Released order reservation', 'system')
    `,
    txn`
      update ingredients
      set reserved_stock = greatest(0, reserved_stock - ${item.quantity}), updated_at = now()
      where id = ${item.ingredient_id}
    `
  ]));
  return { released: true };
}

async function pendingReservationTotal(sql, orderId) {
  const rows = await sql`
    select coalesce(sum(case
      when movement_type = 'reservation' then quantity_change
      when movement_type = 'reservation_release' then quantity_change
      else 0
    end), 0)::float as quantity
    from inventory_movements
    where related_order_id = ${orderId}
      and movement_type in ('reservation', 'reservation_release')
  `;
  return Math.max(0, Number(rows[0]?.quantity ?? 0));
}

async function reservationBalancesForOrder(sql, orderId) {
  const rows = await sql`
    select ingredient_id, unit, coalesce(sum(case
      when movement_type = 'reservation' then quantity_change
      when movement_type = 'reservation_release' then quantity_change
      else 0
    end), 0)::float as quantity
    from inventory_movements
    where related_order_id = ${orderId}
      and movement_type in ('reservation', 'reservation_release')
    group by ingredient_id, unit
  `;
  return new Map(rows.map((row) => [`${row.ingredient_id}:${row.unit}`, Math.max(0, Number(row.quantity))]));
}

async function shortagesForProduction(sql, orderId, requirements) {
  return Promise.all(requirements.map(async (item) => {
    const rows = await sql`
      select current_stock::float as current_stock, reserved_stock::float as reserved_stock
      from ingredients
      where id = ${item.ingredient_id}
    `;
    const reservationRows = await sql`
      select coalesce(sum(case
        when movement_type = 'reservation' then quantity_change
        when movement_type = 'reservation_release' then quantity_change
        else 0
      end), 0)::float as quantity
      from inventory_movements
      where related_order_id = ${orderId}
        and ingredient_id = ${item.ingredient_id}
        and movement_type in ('reservation', 'reservation_release')
    `;
    const ingredient = rows[0];
    const requiredQuantity = Number(item.quantity);
    const currentStock = Number(ingredient?.current_stock ?? 0);
    const reservedStock = Number(ingredient?.reserved_stock ?? 0);
    const reservedForOrder = Math.max(0, Number(reservationRows[0]?.quantity ?? 0));
    const usableStock = currentStock - Math.max(0, reservedStock - reservedForOrder);
    return {
      ingredientId: item.ingredient_id,
      unit: item.unit,
      requiredQuantity,
      availableQuantity: usableStock,
      shortageQuantity: Math.max(0, requiredQuantity - usableStock)
    };
  })).then((rows) => rows.filter((row) => row.shortageQuantity > 0));
}

export async function produceOrder(sql, orderId) {
  const orderRows = await sql`select status from orders where id = ${orderId}`;
  if (!orderRows.length) throw Object.assign(new Error("Order not found."), { statusCode: 404 });
  const status = orderRows[0].status;
  if (status === "Produced") return { produced: false, alreadyProduced: true };
  if (!["Stock Reserved", "In Production"].includes(status)) {
    throw Object.assign(new Error("Start production before marking this order as produced."), { statusCode: 409 });
  }

  const requirements = await requirementsForOrder(sql, orderId);
  const shortages = await shortagesForProduction(sql, orderId, requirements);
  if (shortages.length) {
    await sql`update orders set stock_status = 'Shortage', updated_at = now() where id = ${orderId}`;
    throw Object.assign(new Error("Cannot mark produced while ingredients are short."), { statusCode: 409, details: shortages });
  }

  const batchDeductions = await Promise.all(requirements.map((requirement) => batchDeductionsForRequirement(sql, requirement)));
  await sql.transaction((txn) => [
    ...requirements.flatMap((requirement, index) => [
      txn`
        insert into inventory_movements (id, ingredient_id, movement_type, quantity_change, unit, related_order_id, note, created_by)
        values (${id(`mov-prod-${index}`)}, ${requirement.ingredient_id}, 'production_use', ${-Number(requirement.quantity)}, ${requirement.unit}, ${orderId}, 'Deducted when order was marked produced', 'system')
      `,
      txn`
        update ingredients
        set current_stock = current_stock - ${Number(requirement.quantity)},
          reserved_stock = greatest(0, reserved_stock - ${Number(requirement.quantity)}),
          updated_at = now()
        where id = ${requirement.ingredient_id}
      `
    ]),
    ...batchDeductions.flatMap((deductions) => deductions.map((deduction) => txn`
      update ingredient_batches
      set quantity_remaining = greatest(0, quantity_remaining - ${deduction.quantity}), updated_at = now()
      where id = ${deduction.batchId}
    `)),
    txn`update orders set status = 'Produced', production_status = 'Completed', stock_status = 'In Stock', updated_at = now() where id = ${orderId}`
  ]);
  await audit(sql, "orders", orderId, "produce", { status }, await rowById(sql, "orders", orderId));
  return { produced: true };
}

export async function handleAction(sql, body) {
  const action = required(body.action, "Action");
  await ensureOperationalTables(sql);

  if (action === "schema.ensure") {
    return { ok: true };
  }

  if (action === "archive.list") {
    const [archivedIngredients, archivedRecipes, archivedOrders, archivedSuppliers, archivedConversions, auditRows] = await Promise.all([
      sql`select id, name from ingredients where active = false order by updated_at desc limit 50`,
      sql`select id, name from recipes where active = false order by updated_at desc limit 50`,
      sql`select id, customer_name as name from orders where archived = true order by updated_at desc limit 50`,
      sql`select id, name from suppliers where active = false order by updated_at desc limit 50`,
      sql`select conversion_rules.id, ingredients.name || ' ' || from_unit || ' to ' || to_unit as name from conversion_rules join ingredients on ingredients.id = conversion_rules.ingredient_id where conversion_rules.active = false order by conversion_rules.updated_at desc limit 50`,
      sql`select id, entity_type as "entityType", entity_id as "entityId", action, created_at as "createdAt" from audit_logs order by created_at desc limit 50`
    ]);
    return { archivedIngredients, archivedRecipes, archivedOrders, archivedSuppliers, archivedConversions, auditRows };
  }

  if (action === "archive.restore") {
    const entityType = required(body.entityType, "Entity type");
    const entityId = required(body.entityId, "Entity");
    const before = await rowById(sql, entityType === "order" ? "orders" : entityType === "conversion" ? "conversion_rules" : `${entityType}s`, entityId);
    if (entityType === "ingredient") await sql`update ingredients set active = true, updated_at = now() where id = ${entityId}`;
    else if (entityType === "recipe") {
      const rows = await sql`select product_id from recipes where id = ${entityId}`;
      await sql.transaction((txn) => [
        txn`update recipes set active = true, updated_at = now() where id = ${entityId}`,
        ...(rows[0]?.product_id ? [txn`update products set active = true, updated_at = now() where id = ${rows[0].product_id}`] : [])
      ]);
    } else if (entityType === "order") await sql`update orders set archived = false, updated_at = now() where id = ${entityId}`;
    else if (entityType === "supplier") await sql`update suppliers set active = true, updated_at = now() where id = ${entityId}`;
    else if (entityType === "conversion") await sql`update conversion_rules set active = true, updated_at = now() where id = ${entityId}`;
    else throw Object.assign(new Error("Unsupported archive type."), { statusCode: 400 });
    await audit(sql, entityType, entityId, "restore", before, { restored: true });
    return { ok: true, restored: true };
  }

  if (action === "ingredient.save") {
    const data = body.ingredient ?? {};
    const ingredientId = data.id || id("ing");
    const supplierId = data.supplierId || null;
    const baseUnit = normalizeUnit(data.baseUnit);
    const name = required(data.name, "Ingredient name");
    const category = required(data.category, "Category");
    const currentStock = nonNegative(num(data.currentStock), "Current stock");
    const reorderLevel = nonNegative(num(data.reorderLevel), "Reorder level");
    const purchaseQuantity = nonNegative(num(data.purchaseQuantity), "Purchase quantity");
    const purchasePrice = nonNegative(num(data.purchasePrice), "Purchase price");
    if (purchasePrice > 0 && purchaseQuantity <= 0) {
      throw Object.assign(new Error("Purchase quantity is required when purchase price is entered."), { statusCode: 400 });
    }
    const duplicateRows = data.id ? [] : await sql`
      select id
      from ingredients
      where active = true and lower(name) = lower(${name})
      limit 1
    `;
    if (duplicateRows.length) {
      throw Object.assign(new Error(`${name} already exists in inventory. Open the existing ingredient to edit stock or cost.`), { statusCode: 409 });
    }
    const existingRows = data.id ? await sql`select latest_unit_cost::float as latest_unit_cost from ingredients where id = ${data.id}` : [];
    const before = data.id ? await rowById(sql, "ingredients", data.id) : null;
    const fallbackUnitCost = data.latestUnitCost === undefined || data.latestUnitCost === "" ? Number(existingRows[0]?.latest_unit_cost ?? 0) : nonNegative(num(data.latestUnitCost), "Latest unit cost");
    const stockAfterPurchase = currentStock + purchaseQuantity;
    const convertedPurchaseQuantity = purchaseQuantity || currentStock;
    const latestUnitCost = purchasePrice > 0 && purchaseQuantity > 0 ? purchasePrice / purchaseQuantity : fallbackUnitCost;
    const defaultExpiryDays = num(data.defaultExpiryDays) || null;
    const expiryDate = data.expiryDate || (bool(data.expiryTrackingEnabled) && defaultExpiryDays
      ? new Date(Date.now() + defaultExpiryDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      : null);

    const purchaseId = id("pur");
    await sql.transaction((txn) => [
      txn`
        insert into ingredients (id, name, category, base_unit, current_stock, reorder_level, latest_unit_cost, supplier_id, expiry_tracking_enabled, default_expiry_days, expiry_date, notes)
        values (${ingredientId}, ${name}, ${category}, ${baseUnit}, ${stockAfterPurchase}, ${reorderLevel}, ${latestUnitCost}, ${supplierId}, ${bool(data.expiryTrackingEnabled)}, ${defaultExpiryDays}, ${expiryDate}, ${data.notes || null})
        on conflict (id) do update set name = excluded.name, category = excluded.category, base_unit = excluded.base_unit,
          current_stock = excluded.current_stock, reorder_level = excluded.reorder_level, latest_unit_cost = excluded.latest_unit_cost,
          supplier_id = excluded.supplier_id, expiry_tracking_enabled = excluded.expiry_tracking_enabled, default_expiry_days = excluded.default_expiry_days,
          expiry_date = excluded.expiry_date, notes = excluded.notes, updated_at = now()
      `,
      ...(purchaseQuantity > 0 ? [
        txn`
          insert into purchase_logs (id, supplier_id, ingredient_id, purchase_quantity, purchase_unit, purchase_price, converted_quantity_in_base_unit, cost_per_base_unit, expiry_date, notes)
          values (${purchaseId}, ${supplierId}, ${ingredientId}, ${purchaseQuantity}, ${normalizeUnit(data.purchaseUnit, baseUnit)}, ${purchasePrice}, ${convertedPurchaseQuantity}, ${latestUnitCost}, ${expiryDate}, 'Initial purchase from ingredient form')
        `,
        txn`
          insert into inventory_movements (id, ingredient_id, movement_type, quantity_change, unit, note, created_by)
          values (${id("mov")}, ${ingredientId}, 'purchase', ${purchaseQuantity}, ${baseUnit}, 'Added stock from ingredient form purchase', 'system')
        `,
        createBatchFromPurchase(txn, { purchaseId, ingredientId, quantity: purchaseQuantity, unit: baseUnit, expiryDate, note: "Initial purchase from ingredient form" })
      ] : [
        txn`
          insert into inventory_movements (id, ingredient_id, movement_type, quantity_change, unit, note, created_by)
          values (${id("mov-audit")}, ${ingredientId}, 'correction', 0, ${baseUnit}, ${data.id ? "Ingredient profile updated" : "Ingredient profile created"}, 'system')
        `
      ])
    ]);
    await audit(sql, "ingredients", ingredientId, data.id ? "update" : "create", before, await rowById(sql, "ingredients", ingredientId));
    return { ok: true, id: ingredientId };
  }

  if (action === "ingredient.delete") {
    const ingredientId = required(body.ingredientId, "Ingredient");
    const before = await rowById(sql, "ingredients", ingredientId);
    await sql.transaction((txn) => [
      txn`
        update ingredients
        set active = false, updated_at = now()
        where id = ${ingredientId}
      `,
      txn`
        insert into inventory_movements (id, ingredient_id, movement_type, quantity_change, unit, note, created_by)
        select ${id("mov-archive")}, id, 'correction', 0, base_unit, 'Ingredient archived', 'system'
        from ingredients
        where id = ${ingredientId}
      `
    ]);
    await audit(sql, "ingredients", ingredientId, "archive", before, await rowById(sql, "ingredients", ingredientId));
    return { ok: true, archived: true };
  }

  if (action === "ingredient.restore") {
    const ingredientId = required(body.ingredientId, "Ingredient");
    const before = await rowById(sql, "ingredients", ingredientId);
    await sql`update ingredients set active = true, updated_at = now() where id = ${ingredientId}`;
    await audit(sql, "ingredients", ingredientId, "restore", before, await rowById(sql, "ingredients", ingredientId));
    return { ok: true, restored: true };
  }

  if (action === "inventory.adjust") {
    const quantity = num(body.quantityChange);
    const ingredientId = required(body.ingredientId, "Ingredient");
    const movementType = String(body.movementType || "adjustment");
    if (!movementTypes.has(movementType)) {
      throw Object.assign(new Error("Invalid movement type."), { statusCode: 400 });
    }
    if (quantity === 0) {
      throw Object.assign(new Error("Adjustment quantity cannot be zero."), { statusCode: 400 });
    }
    const ingredientRows = await sql`select current_stock::float as current_stock from ingredients where id = ${ingredientId}`;
    const before = await rowById(sql, "ingredients", ingredientId);
    if (!ingredientRows.length) throw Object.assign(new Error("Ingredient not found."), { statusCode: 404 });
    if (Number(ingredientRows[0].current_stock) + quantity < 0) {
      throw Object.assign(new Error("Adjustment would make stock negative."), { statusCode: 400 });
    }
    await sql.transaction((txn) => [
      txn`
        insert into inventory_movements (id, ingredient_id, movement_type, quantity_change, unit, note, created_by)
        values (${id("mov")}, ${ingredientId}, ${movementType}, ${quantity}, ${required(body.unit, "Unit")}, ${body.note || "Manual stock adjustment"}, 'system')
      `,
      txn`update ingredients set current_stock = current_stock + ${quantity}, updated_at = now() where id = ${ingredientId}`
    ]);
    await audit(sql, "ingredients", ingredientId, "stock_adjust", before, await rowById(sql, "ingredients", ingredientId));
    return { ok: true };
  }

  if (action === "supplier.save") {
    const data = body.supplier ?? {};
    const supplierId = data.id || id("sup");
    const before = data.id ? await rowById(sql, "suppliers", data.id) : null;
    const suppliedIngredientIds = Array.isArray(data.suppliedIngredientIds) ? data.suppliedIngredientIds.map(String) : [];
    await sql`
      insert into suppliers (id, name, contact_name, phone, email, address, default_currency, lead_time_days, supplied_ingredient_ids, notes)
      values (${supplierId}, ${required(data.name, "Supplier name")}, ${data.contactName || null}, ${data.phone || null}, ${data.email || null}, ${data.address || null}, ${data.defaultCurrency || "NGN"}, ${nonNegative(num(data.leadTimeDays, 2), "Lead time")}, ${suppliedIngredientIds}, ${data.notes || null})
      on conflict (id) do update set name = excluded.name, contact_name = excluded.contact_name, phone = excluded.phone,
        email = excluded.email, address = excluded.address, default_currency = excluded.default_currency, lead_time_days = excluded.lead_time_days,
        supplied_ingredient_ids = excluded.supplied_ingredient_ids, notes = excluded.notes, active = true, updated_at = now()
    `;
    await audit(sql, "suppliers", supplierId, data.id ? "update" : "create", before, await rowById(sql, "suppliers", supplierId));
    return { ok: true, id: supplierId };
  }

  if (action === "recipe.save") {
    const data = body.recipe ?? {};
    const productId = data.productId || id("prod");
    const recipeId = data.id || id("rec");
    const before = data.id ? await rowById(sql, "recipes", data.id) : null;
    const items = Array.isArray(data.items) ? data.items.filter((item) => item.ingredientId && num(item.quantity) > 0) : [];
    if (!items.length) throw Object.assign(new Error("Add at least one recipe ingredient."), { statusCode: 400 });
    const instructions = String(data.instructions || "").split(/\n+/).map((step) => step.trim()).filter(Boolean);
    await sql.transaction((txn) => [
      txn`
        insert into products (id, name, category, description, active)
        values (${productId}, ${required(data.name, "Product name")}, ${required(data.category, "Category")}, ${data.notes || null}, true)
        on conflict (id) do update set name = excluded.name, category = excluded.category, description = excluded.description, updated_at = now()
      `,
      txn`
        insert into recipes (id, product_id, name, category, base_yield_quantity, yield_unit, instructions, notes, active)
        values (${recipeId}, ${productId}, ${required(data.name, "Recipe name")}, ${required(data.category, "Category")}, ${num(data.baseYieldQuantity, 1)}, ${data.yieldUnit || "pieces"}, ${instructions}, ${data.notes || null}, true)
        on conflict (id) do update set name = excluded.name, category = excluded.category, base_yield_quantity = excluded.base_yield_quantity,
          yield_unit = excluded.yield_unit, instructions = excluded.instructions, notes = excluded.notes, updated_at = now()
      `,
      txn`delete from recipe_items where recipe_id = ${recipeId}`,
      ...items.map((item, index) => txn`
        insert into recipe_items (id, recipe_id, ingredient_id, quantity, unit, waste_percentage, notes)
        values (${id(`ri-${index}`)}, ${recipeId}, ${item.ingredientId}, ${num(item.quantity)}, ${normalizeUnit(item.unit)}, ${num(item.wastePercentage)}, ${item.notes || null})
      `)
    ]);
    await audit(sql, "recipes", recipeId, data.id ? "update" : "create", before, await rowById(sql, "recipes", recipeId));
    return { ok: true, id: recipeId, productId };
  }

  if (action === "recipe.delete") {
    const recipeId = required(body.recipeId, "Recipe");
    const rows = await sql`select product_id from recipes where id = ${recipeId}`;
    if (!rows.length) throw Object.assign(new Error("Recipe not found."), { statusCode: 404 });
    const before = await rowById(sql, "recipes", recipeId);
    await sql.transaction((txn) => [
      txn`update recipes set active = false, updated_at = now() where id = ${recipeId}`,
      txn`update products set active = false, updated_at = now() where id = ${rows[0].product_id}`
    ]);
    await audit(sql, "recipes", recipeId, "archive", before, await rowById(sql, "recipes", recipeId));
    return { ok: true, archived: true };
  }

  if (action === "order.save") {
    await sql`alter table orders add column if not exists archived boolean not null default false`;
    const data = body.order ?? {};
    const orderId = data.id || id("ord");
    const before = data.id ? await rowById(sql, "orders", data.id) : null;
    const items = Array.isArray(data.items) ? data.items.filter((item) => item.productId && item.recipeId && num(item.requestedYieldQuantity) > 0) : [];
    if (!items.length) throw Object.assign(new Error("Add at least one order item."), { statusCode: 400 });
    await sql.transaction((txn) => [
      txn`
        insert into orders (id, customer_name, customer_phone, due_date, delivery_method, status, payment_status, production_status, stock_status, notes, archived)
        values (${orderId}, ${required(data.customerName, "Customer name")}, ${data.customerPhone || null}, ${required(data.dueDate, "Due date")}, ${data.deliveryMethod || "Pickup"}, ${data.status || "Confirmed"}, ${data.paymentStatus || "Unpaid"}, 'Not Started', 'In Stock', ${data.notes || null}, false)
        on conflict (id) do update set customer_name = excluded.customer_name, customer_phone = excluded.customer_phone, due_date = excluded.due_date,
          delivery_method = excluded.delivery_method, status = excluded.status, payment_status = excluded.payment_status, notes = excluded.notes, archived = false, updated_at = now()
      `,
      txn`delete from order_items where order_id = ${orderId}`,
      ...items.map((item, index) => txn`
        insert into order_items (id, order_id, product_id, recipe_id, requested_yield_quantity, yield_unit, quantity_multiplier, notes)
        values (${id(`oi-${index}`)}, ${orderId}, ${item.productId}, ${item.recipeId}, ${num(item.requestedYieldQuantity, 1)}, ${item.yieldUnit || "pieces"}, ${num(item.quantityMultiplier, 1)}, ${item.notes || null})
      `)
    ]);
    const stockStatus = await stockStatusForRequirements(sql, await requirementsForOrder(sql, orderId));
    await sql`update orders set stock_status = ${stockStatus}, updated_at = now() where id = ${orderId}`;
    const reservation = body.reserve ? await reserveOrder(sql, orderId) : null;
    await audit(sql, "orders", orderId, data.id ? "update" : "create", before, await rowById(sql, "orders", orderId));
    return { ok: true, id: orderId, stockStatus, reservation };
  }

  if (action === "order.reserve") return reserveOrder(sql, required(body.orderId, "Order"));
  if (action === "order.releaseReservation") return releaseReservation(sql, required(body.orderId, "Order"));
  if (action === "order.produce") return produceOrder(sql, required(body.orderId, "Order"));

  if (action === "order.delete") {
    await sql`alter table orders add column if not exists archived boolean not null default false`;
    const orderId = required(body.orderId, "Order");
    const before = await rowById(sql, "orders", orderId);
    await releaseReservation(sql, orderId);
    await sql`
      update orders
      set archived = true, status = 'Cancelled', stock_status = 'In Stock', updated_at = now()
      where id = ${orderId}
    `;
    await audit(sql, "orders", orderId, "archive", before, await rowById(sql, "orders", orderId));
    return { ok: true, archived: true };
  }

  if (action === "order.status") {
    const orderId = required(body.orderId, "Order");
    const status = required(body.status, "Status");
    const before = await rowById(sql, "orders", orderId);
    const productionStatus = body.productionStatus || (status === "In Production" ? "In Progress" : status === "Delivered" || status === "Produced" ? "Completed" : undefined);
    if (status === "In Production") {
      const reservation = await reserveOrder(sql, orderId);
      if (reservation.shortage) {
        throw Object.assign(new Error("Cannot start production until ingredient shortages are resolved."), { statusCode: 409 });
      }
    }
    if (status === "Produced") return produceOrder(sql, orderId);
    if (status === "Delivered") {
      const rows = await sql`select status, stock_status from orders where id = ${orderId}`;
      if (rows[0]?.status !== "Produced") {
        throw Object.assign(new Error("Mark the order as produced before delivery."), { statusCode: 409 });
      }
      if (rows[0]?.stock_status === "Shortage") {
        throw Object.assign(new Error("Resolve ingredient shortages before delivery."), { statusCode: 409 });
      }
    }
    await sql`
      update orders
      set status = ${status}, production_status = coalesce(${productionStatus || null}, production_status), updated_at = now()
      where id = ${orderId}
    `;
    if (status === "Cancelled") await releaseReservation(sql, orderId);
    await audit(sql, "orders", orderId, "status_change", before, await rowById(sql, "orders", orderId));
    return { ok: true };
  }

  if (action === "production.batchStatus") {
    const orderIds = Array.isArray(body.orderIds) ? body.orderIds.map(String) : [];
    if (!orderIds.length) throw Object.assign(new Error("Select at least one order for this production batch."), { statusCode: 400 });
    const status = required(body.status, "Status");
    const productionStatus = body.productionStatus || (status === "In Production" ? "In Progress" : status === "Produced" ? "Completed" : "Ready");
    if (status === "Produced") {
      const results = [];
      for (const orderId of orderIds) {
        const reservation = await reserveOrder(sql, orderId);
        if (reservation.shortage) {
          throw Object.assign(new Error("Cannot complete this batch until ingredient shortages are resolved."), { statusCode: 409 });
        }
        await sql`
          update orders
          set status = 'In Production', production_status = 'In Progress', updated_at = now()
          where id = ${orderId} and status not in ('Produced', 'Delivered', 'Cancelled')
        `;
        results.push(await produceOrder(sql, orderId));
      }
      return { ok: true, count: results.length, results };
    }
    if (status === "In Production") {
      for (const orderId of orderIds) {
        const reservation = await reserveOrder(sql, orderId);
        if (reservation.shortage) {
          throw Object.assign(new Error("Cannot start this batch until ingredient shortages are resolved."), { statusCode: 409 });
        }
      }
    }
    await sql.transaction((txn) => orderIds.map((orderId) => txn`
      update orders
      set status = ${status}, production_status = ${productionStatus}, updated_at = now()
      where id = ${orderId}
    `));
    return { ok: true, count: orderIds.length };
  }

  if (action === "shopping.purchaseSuggested") {
    const purchases = Array.isArray(body.items) ? body.items.filter((item) => item.ingredientId && num(item.purchaseQuantity ?? item.suggestedBuyQuantity) > 0) : [];
    if (!purchases.length) throw Object.assign(new Error("No shopping list items to purchase."), { statusCode: 400 });
    const normalizedPurchases = await Promise.all(purchases.map(async (item, index) => {
      const ingredientId = required(item.ingredientId, "Ingredient");
      const quantity = positive(num(item.purchaseQuantity ?? item.suggestedBuyQuantity), "Purchase quantity");
      const unitCost = nonNegative(num(item.unitCost), "Unit cost");
      const purchasePrice = item.purchasePrice === undefined ? quantity * unitCost : nonNegative(num(item.purchasePrice), "Purchase price");
      const ingredientRows = await sql`select supplier_id, base_unit from ingredients where id = ${ingredientId}`;
      if (!ingredientRows.length) throw Object.assign(new Error("Ingredient not found."), { statusCode: 404 });
      return {
        index,
        purchaseId: id(`pur-${index}`),
        ingredientId,
        supplierId: item.supplierId || ingredientRows[0].supplier_id || null,
        quantity,
        unit: normalizeUnit(item.unit, ingredientRows[0].base_unit),
        purchasePrice,
        unitCost: purchasePrice > 0 ? purchasePrice / quantity : unitCost,
        expiryDate: item.expiryDate || null,
        note: item.note || "Marked purchased from shopping list"
      };
    }));
    await sql.transaction((txn) => normalizedPurchases.flatMap((item) => {
      return [
        txn`
          insert into purchase_logs (id, supplier_id, ingredient_id, purchase_quantity, purchase_unit, purchase_price, converted_quantity_in_base_unit, cost_per_base_unit, expiry_date, notes)
          values (${item.purchaseId}, ${item.supplierId}, ${item.ingredientId}, ${item.quantity}, ${item.unit}, ${item.purchasePrice}, ${item.quantity}, ${item.unitCost}, ${item.expiryDate}, ${item.note})
        `,
        txn`
          insert into inventory_movements (id, ingredient_id, movement_type, quantity_change, unit, related_purchase_id, note, created_by)
          values (${id(`mov-${item.index}`)}, ${item.ingredientId}, 'purchase', ${item.quantity}, ${item.unit}, ${item.purchaseId}, ${item.note}, 'system')
        `,
        txn`
          update ingredients
          set current_stock = current_stock + ${item.quantity},
            latest_unit_cost = case when ${item.unitCost} > 0 then ${item.unitCost} else latest_unit_cost end,
            updated_at = now()
          where id = ${item.ingredientId}
        `,
        createBatchFromPurchase(txn, item)
      ];
    }));
    await Promise.all(normalizedPurchases.map((item) => audit(sql, "ingredients", item.ingredientId, "purchase", null, { purchaseId: item.purchaseId, quantity: item.quantity, unit: item.unit, expiryDate: item.expiryDate })));
    return { ok: true, count: normalizedPurchases.length };
  }

  if (action === "conversion.save") {
    const data = body.rule ?? {};
    const ruleId = data.id || id("conv");
    const before = data.id ? await rowById(sql, "conversion_rules", data.id) : null;
    await sql`
      insert into conversion_rules (id, ingredient_id, from_unit, to_unit, conversion_factor, conversion_type, confidence_level, source, verified, notes)
      values (${ruleId}, ${required(data.ingredientId, "Ingredient")}, ${required(data.fromUnit, "From unit")}, ${required(data.toUnit, "To unit")}, ${num(data.conversionFactor, 1)}, ${data.conversionType || "ingredient_specific"}, ${data.confidenceLevel || "Medium"}, ${data.source || "manual entry"}, ${bool(data.verified)}, ${data.notes || null})
      on conflict (id) do update set ingredient_id = excluded.ingredient_id, from_unit = excluded.from_unit, to_unit = excluded.to_unit,
        conversion_factor = excluded.conversion_factor, conversion_type = excluded.conversion_type, confidence_level = excluded.confidence_level,
        source = excluded.source, verified = excluded.verified, notes = excluded.notes, updated_at = now()
    `;
    await audit(sql, "conversion_rules", ruleId, data.id ? "update" : "create", before, await rowById(sql, "conversion_rules", ruleId));
    return { ok: true, id: ruleId };
  }

  if (action === "conversion.verify") {
    const ruleId = required(body.ruleId, "Rule");
    const before = await rowById(sql, "conversion_rules", ruleId);
    await sql`update conversion_rules set verified = true, source = 'measured in kitchen', updated_at = now() where id = ${ruleId}`;
    await audit(sql, "conversion_rules", ruleId, "verify", before, await rowById(sql, "conversion_rules", ruleId));
    return { ok: true };
  }

  if (action === "conversion.delete") {
    const ruleId = required(body.ruleId, "Rule");
    const before = await rowById(sql, "conversion_rules", ruleId);
    await sql`update conversion_rules set active = false, updated_at = now() where id = ${ruleId}`;
    await audit(sql, "conversion_rules", ruleId, "archive", before, await rowById(sql, "conversion_rules", ruleId));
    return { ok: true, archived: true };
  }

  if (action === "supplier.delete") {
    const supplierId = required(body.supplierId, "Supplier");
    const before = await rowById(sql, "suppliers", supplierId);
    await sql.transaction((txn) => [
      txn`update ingredients set supplier_id = null, updated_at = now() where supplier_id = ${supplierId}`,
      txn`update suppliers set active = false, updated_at = now() where id = ${supplierId}`
    ]);
    await audit(sql, "suppliers", supplierId, "archive", before, await rowById(sql, "suppliers", supplierId));
    return { ok: true, archived: true };
  }

  if (action === "settings.save") {
    const data = body.settings ?? {};
    const before = await rowById(sql, "settings", "default");
    await sql`
      insert into settings (id, business_name, currency, default_deduction_stage, allow_negative_inventory, require_ai_conversion_confirmation, gram_rounding_preference, egg_rounding_preference, safety_margin_percentage, default_tax_percentage, low_stock_notification_email)
      values ('default', ${data.businessName || "Pastry County"}, 'NGN', ${data.defaultDeductionStage || "production_completion"}, ${bool(data.allowNegativeInventory)}, ${bool(data.requireAiConversionConfirmation)}, ${num(data.gramRoundingPreference, 5)}, ${data.eggRoundingPreference || "nearest_whole_egg"}, ${nonNegative(num(data.safetyMarginPercentage, 10), "Safety margin")}, ${nonNegative(num(data.defaultTaxPercentage, 0), "Tax percentage")}, ${data.lowStockNotificationEmail || null})
      on conflict (id) do update set business_name = excluded.business_name, default_deduction_stage = excluded.default_deduction_stage,
        allow_negative_inventory = excluded.allow_negative_inventory, require_ai_conversion_confirmation = excluded.require_ai_conversion_confirmation,
        gram_rounding_preference = excluded.gram_rounding_preference, egg_rounding_preference = excluded.egg_rounding_preference,
        safety_margin_percentage = excluded.safety_margin_percentage, default_tax_percentage = excluded.default_tax_percentage,
        low_stock_notification_email = excluded.low_stock_notification_email, updated_at = now()
    `;
    await audit(sql, "settings", "default", "update", before, await rowById(sql, "settings", "default"));
    return { ok: true };
  }

  throw Object.assign(new Error(`Unknown action: ${action}`), { statusCode: 400 });
}
