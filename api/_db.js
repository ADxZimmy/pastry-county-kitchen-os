import crypto from "node:crypto";
import { neon } from "@neondatabase/serverless";

export function getSql() {
  if (!process.env.DATABASE_URL) {
    throw Object.assign(new Error("DATABASE_URL is not configured in Vercel environment variables."), { statusCode: 503 });
  }
  return neon(process.env.DATABASE_URL);
}

export function setPrivateNoStore(res) {
  res.setHeader("Cache-Control", "private, no-store");
}

// An explicit statusCode marks an error we threw deliberately with a user-safe
// message. Anything without one is unexpected (driver/SQL/provider internals)
// and must not have its raw message returned to the client.
export function safeErrorResponse(error, correlationId = null) {
  const explicitStatus = Number(error?.statusCode);
  if (Number.isFinite(explicitStatus) && explicitStatus > 0) {
    return { status: explicitStatus, body: { error: error?.message ?? "Unexpected server error" } };
  }
  return {
    status: 500,
    body: {
      error: "Something went wrong while processing that request. Please try again.",
      ...(correlationId ? { correlationId } : {})
    }
  };
}

export function sendError(res, error) {
  const explicitStatus = Number(error?.statusCode);
  const isUnexpected = !(Number.isFinite(explicitStatus) && explicitStatus > 0);
  const correlationId = isUnexpected ? crypto.randomUUID() : null;
  if (isUnexpected) console.error(`[api-error ${correlationId}]`, error);
  const { status, body } = safeErrorResponse(error, correlationId);
  res.status(status).json(body);
}

export const first = (rows) => rows[0];

// Every statement below used to run on each bootstrap -- roughly forty ALTERs
// and CREATEs plus a repair UPDATE, on a read path. They are idempotent, so it
// worked, but it made a read do schema work and write to the database. They now
// run only from scripts/migrate.mjs.
export async function ensureSnapshotSchema(sql) {
  await sql`alter table orders add column if not exists archived boolean not null default false`;
  await sql`alter table orders add column if not exists delivery_fee numeric(14,2)`;
  await sql`alter table orders add column if not exists discount_amount numeric(14,2)`;
  await sql`alter table orders add column if not exists tax_rate numeric(6,3)`;
  await sql`alter table orders add column if not exists amount_paid numeric(14,2)`;
  await sql`alter table orders add column if not exists subtotal numeric(14,2)`;
  await sql`alter table orders add column if not exists tax_amount numeric(14,2)`;
  await sql`alter table orders add column if not exists net_total numeric(14,2)`;
  await sql`alter table orders add column if not exists gross_total numeric(14,2)`;
  await sql`alter table orders add column if not exists balance numeric(14,2)`;
  await sql`alter table order_items add column if not exists sale_quantity numeric(14,3)`;
  await sql`alter table order_items add column if not exists unit_selling_price numeric(14,2)`;
  await sql`alter table suppliers add column if not exists default_currency text not null default 'NGN'`;
  await sql`alter table suppliers add column if not exists lead_time_days integer not null default 2`;
  await sql`alter table suppliers add column if not exists supplied_ingredient_ids text[] not null default '{}'`;
  await sql`alter table suppliers add column if not exists active boolean not null default true`;
  await sql`alter table ingredients add column if not exists purchase_unit text`;
  await sql`alter table ingredients add column if not exists allergen_profile jsonb not null default '{}'`;
  await sql`alter table ingredients add column if not exists storage_profile jsonb not null default '{}'`;
  await sql`alter table ingredients add column if not exists allows_decimals boolean`;
  await sql`alter table ingredients add column if not exists minimum_increment numeric(14,4)`;
  await sql`update ingredients set purchase_unit = base_unit where purchase_unit is null or purchase_unit = ''`;
  await sql`alter table ingredients alter column purchase_unit set default 'g'`;
  await sql`alter table ingredients alter column purchase_unit set not null`;
  await sql`alter table conversion_rules add column if not exists active boolean not null default true`;
  await sql`alter table conversion_rules add column if not exists ingredient_state text`;
  await sql`alter table conversion_rules add column if not exists temperature_state text`;
  await sql`alter table conversion_rules add column if not exists formula_context text`;
  await sql`alter table recipes add column if not exists formula_metadata jsonb not null default '{}'`;
  await sql`alter table recipes add column if not exists cost_profile jsonb not null default '{}'`;
  await sql`alter table recipe_items add column if not exists prep_state jsonb not null default '{}'`;
  await sql`alter table settings add column if not exists safety_margin_percentage numeric(6,3) not null default 10`;
  await sql`alter table settings add column if not exists default_tax_percentage numeric(6,3) not null default 0`;
  await sql`alter table settings add column if not exists low_stock_notification_email text`;
  await sql`alter table settings add column if not exists stock_hold_stage text not null default 'order_confirmation'`;
  await sql`alter table app_users add column if not exists active boolean not null default true`;
  await sql`alter table app_users add column if not exists session_revoked_at timestamptz`;
  await sql`
    create table if not exists notification_events (
      id text primary key,
      type text not null,
      recipient text,
      subject text not null,
      body text not null,
      status text not null default 'logged',
      created_by text,
      created_at timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists order_events (
      id text primary key,
      order_id text not null references orders(id),
      event_type text not null,
      actor_user_id text,
      actor_name text not null default 'system',
      previous_status text,
      new_status text,
      metadata jsonb not null default '{}'::jsonb,
      note text,
      created_at timestamptz not null default now()
    )
  `;
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
  await sql`
    create table if not exists production_qc_logs (
      id text primary key,
      order_id text not null references orders(id),
      recipe_id text references recipes(id),
      batch_key text,
      formula_version text,
      expected_yield_quantity numeric(14,3),
      actual_yield_quantity numeric(14,3),
      yield_unit text,
      room_temperature text,
      mix_temperature text,
      oven_temperature text,
      bake_time_minutes numeric(8,2),
      rest_time_minutes numeric(8,2),
      sensory_notes text,
      defects text,
      next_adjustment text,
      passed_qc boolean not null default true,
      logged_by text,
      created_at timestamptz not null default now()
    )
  `;
}

export async function loadKitchenSnapshot(sql = getSql()) {
  const [
    supplierRows,
    userRows,
    ingredientRows,
    productRows,
    recipeRows,
    recipeItemRows,
    orderRows,
    orderItemRows,
    orderEventRows,
    movementRows,
    batchRows,
    qcRows,
    conversionRows,
    settingRows
  ] = await Promise.all([
    sql`select id, name, contact_name as "contactName", phone, email, address, default_currency as "defaultCurrency", lead_time_days as "leadTimeDays", supplied_ingredient_ids as "suppliedIngredientIds", notes, active from suppliers where active = true order by name`,
    sql`select id, email, full_name as "fullName", role, active, session_revoked_at::text as "sessionRevokedAt", updated_at::date::text as "updatedAt" from app_users order by role, full_name`,
    sql`
      select ingredients.id, name, category, base_unit as "baseUnit", current_stock::float as "currentStock",
        reorder_level::float as "reorderLevel", coalesce(nullif(latest_unit_cost, 0), latest_purchase.cost_per_base_unit, 0)::float as "latestUnitCost",
        coalesce(nullif(purchase_unit, ''), base_unit) as "purchaseUnit",
        supplier_id as "supplierId", expiry_tracking_enabled as "expiryTrackingEnabled",
        default_expiry_days as "defaultExpiryDays", notes, reserved_stock::float as "reservedStock",
        expiry_date::text as "expiryDate",
        coalesce(allergen_profile, '{}'::jsonb) as "allergenProfile",
        coalesce(storage_profile, '{}'::jsonb) as "storageProfile",
        allows_decimals as "allowsDecimals", minimum_increment::float as "minimumIncrement"
      from ingredients
      left join lateral (
        select cost_per_base_unit
        from purchase_logs
        where purchase_logs.ingredient_id = ingredients.id and cost_per_base_unit > 0
        order by purchase_date desc
        limit 1
      ) latest_purchase on true
      where active = true
      order by category, name
    `,
    sql`select id, name, category, description, active from products where active = true order by category, name`,
    sql`
      select id, product_id as "productId", name, category, base_yield_quantity::float as "baseYieldQuantity",
        yield_unit as "yieldUnit", instructions, notes, coalesce(formula_metadata, '{}'::jsonb) as "formulaMetadata",
        coalesce(cost_profile, '{}'::jsonb) as "costProfile", active, updated_at::date::text as "updatedAt"
      from recipes
      where active = true
      order by name
    `,
    sql`
      select recipe_items.id, recipe_id as "recipeId", ingredient_id as "ingredientId", quantity::float, unit,
        waste_percentage::float as "wastePercentage", recipe_items.notes, coalesce(prep_state, '{}'::jsonb) as "prepState"
      from recipe_items
      join recipes on recipes.id = recipe_items.recipe_id
      where recipes.active = true
      order by recipe_id, id
    `,
    sql`
      select id, customer_name as "customerName", customer_phone as "customerPhone", due_date::text as "dueDate",
        delivery_method as "deliveryMethod", status, payment_status as "paymentStatus",
        production_status as "productionStatus", stock_status as "stockStatus", notes,
        delivery_fee::float as "deliveryFee", discount_amount::float as "discountAmount",
        tax_rate::float as "taxRate", amount_paid::float as "amountPaid", subtotal::float as "subtotal",
        tax_amount::float as "taxAmount", net_total::float as "netTotal", gross_total::float as "grossTotal",
        balance::float as "balance"
      from orders
      where coalesce(archived, false) = false
      order by due_date, customer_name
    `,
    sql`
      select order_items.id, order_id as "orderId", product_id as "productId", recipe_id as "recipeId",
        requested_yield_quantity::float as "requestedYieldQuantity", yield_unit as "yieldUnit",
        quantity_multiplier::float as "quantityMultiplier", order_items.notes,
        sale_quantity::float as "saleQuantity", unit_selling_price::float as "unitSellingPrice"
      from order_items
      join orders on orders.id = order_items.order_id
      where coalesce(orders.archived, false) = false
      order by order_id, id
    `,
    sql`
      select order_events.id, order_events.order_id as "orderId", order_events.event_type as "eventType",
        order_events.actor_user_id as "actorUserId", order_events.actor_name as "actorName",
        order_events.previous_status as "previousStatus", order_events.new_status as "newStatus",
        coalesce(order_events.metadata, '{}'::jsonb) as metadata, order_events.note, order_events.created_at as "createdAt"
      from order_events
      join orders on orders.id = order_events.order_id
      where coalesce(orders.archived, false) = false
      order by order_events.created_at
      limit 1000
    `,
    // Narrowed to what cross-cutting logic needs: cancellationConsequences and
    // reservationQuantityForOrder resolve a live order's reservations from this
    // array, so those rows must stay. Stock history is not read from here any
    // more -- ingredient pages, waste reports and dashboard aggregates all go to
    // /api/data/movements, which is complete rather than capped.
    sql`
      select id, ingredient_id as "ingredientId", movement_type as "movementType",
        quantity_change::float as "quantityChange", unit, related_order_id as "relatedOrderId",
        related_order_item_id as "relatedOrderItemId", related_purchase_id as "relatedPurchaseId",
        note, created_by as "createdBy", created_at as "createdAt"
      from inventory_movements
      where movement_type in ('reservation', 'reservation_release')
        and related_order_id in (select id from orders where coalesce(archived, false) = false)
      order by created_at desc
      limit 500
    `,
    // FEFO-ordered and deliberately bounded: the snapshot only needs the lots a
    // kitchen is about to worry about, which is what the expiry notifications and
    // the Next FEFO Lots report read. A specific ingredient's full lot list comes
    // from /api/data/batches?ingredientId=, so narrowing this cannot hide lots on
    // the page that needs them.
    sql`
      select id, ingredient_id as "ingredientId", purchase_id as "purchaseId", quantity_received::float as "quantityReceived",
        quantity_remaining::float as "quantityRemaining", unit, expiry_date::text as "expiryDate", received_date::text as "receivedDate", notes
      from ingredient_batches
      where quantity_remaining > 0
      order by expiry_date nulls last, received_date
      limit 60
    `,
    sql`
      select id, order_id as "orderId", recipe_id as "recipeId", batch_key as "batchKey",
        formula_version as "formulaVersion",
        expected_yield_quantity::float as "expectedYieldQuantity",
        actual_yield_quantity::float as "actualYieldQuantity",
        yield_unit as "yieldUnit", room_temperature as "roomTemperature",
        mix_temperature as "mixTemperature", oven_temperature as "ovenTemperature",
        bake_time_minutes::float as "bakeTimeMinutes",
        rest_time_minutes::float as "restTimeMinutes",
        sensory_notes as "sensoryNotes", defects, next_adjustment as "nextAdjustment",
        passed_qc as "passedQc", logged_by as "loggedBy", created_at as "createdAt"
      from production_qc_logs
      order by created_at desc
      limit 200
    `,
    sql`
      select id, ingredient_id as "ingredientId", from_unit as "fromUnit", to_unit as "toUnit",
        conversion_factor::float as "conversionFactor", conversion_type as "conversionType",
        confidence_level as "confidenceLevel", source, verified, notes,
        ingredient_state as "ingredientState", temperature_state as "temperatureState",
        formula_context as "formulaContext", active, updated_at::date::text as "updatedAt"
      from conversion_rules
      where active = true
      order by ingredient_id, from_unit
    `,
    sql`
      select business_name as "businessName", currency, default_deduction_stage as "defaultDeductionStage",
        stock_hold_stage as "stockHoldStage",
        allow_negative_inventory as "allowNegativeInventory",
        require_ai_conversion_confirmation as "requireAiConversionConfirmation",
        gram_rounding_preference as "gramRoundingPreference",
        egg_rounding_preference as "eggRoundingPreference",
        safety_margin_percentage::float as "safetyMarginPercentage",
        default_tax_percentage::float as "defaultTaxPercentage",
        low_stock_notification_email as "lowStockNotificationEmail"
      from settings
      order by updated_at desc
      limit 1
    `
  ]);

  return {
    suppliers: supplierRows,
    appUsers: userRows,
    ingredients: ingredientRows,
    products: productRows,
    recipes: recipeRows.map((recipe) => ({
      ...recipe,
      instructions: Array.isArray(recipe.instructions) ? recipe.instructions : String(recipe.instructions ?? "").split("\n").filter(Boolean),
      formulaMetadata: recipe.formulaMetadata ?? {},
      costProfile: recipe.costProfile ?? {}
    })),
    recipeItems: recipeItemRows.map((item) => ({ ...item, prepState: item.prepState ?? {} })),
    orders: orderRows,
    orderItems: orderItemRows,
    orderEvents: orderEventRows,
    inventoryMovements: movementRows,
    ingredientBatches: batchRows,
    productionQcLogs: qcRows,
    conversionRules: conversionRows,
    settings: first(settingRows) ?? {
      businessName: "Pastry County",
      currency: "NGN",
      defaultDeductionStage: "production_completion",
      stockHoldStage: "order_confirmation",
      allowNegativeInventory: false,
      requireAiConversionConfirmation: true,
      gramRoundingPreference: 5,
      eggRoundingPreference: "nearest_whole_egg",
      safetyMarginPercentage: 10,
      defaultTaxPercentage: 0,
      lowStockNotificationEmail: ""
    }
  };
}
