import "dotenv/config";
import express from "express";
import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const app = express();
const port = Number(process.env.PORT ?? 5174);

if (!process.env.DATABASE_URL) {
  console.warn("DATABASE_URL is not set. API routes will return a setup error.");
}

const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;

app.use(express.json({ limit: "1mb" }));

function requireDatabase(_req, res, next) {
  if (!sql) {
    res.status(503).json({
      error: "DATABASE_URL is not configured. Create a Neon database, apply db/schema.sql and db/seed.sql, then set DATABASE_URL."
    });
    return;
  }
  next();
}

const first = (rows) => rows[0];

app.get("/api/health", (_req, res) => {
  res.json({ ok: Boolean(sql), database: sql ? "neon" : "missing" });
});

app.post("/api/auth/login", requireDatabase, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = first(await sql`
      select id, email, full_name, role, password_hash
      from app_users
      where lower(email) = lower(${email})
      limit 1
    `);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }
    res.json({ id: user.id, email: user.email, fullName: user.full_name, role: user.role });
  } catch (error) {
    next(error);
  }
});

app.get("/api/bootstrap", requireDatabase, async (_req, res, next) => {
  try {
    const [
      supplierRows,
      ingredientRows,
      productRows,
      recipeRows,
      recipeItemRows,
      orderRows,
      orderItemRows,
      movementRows,
      conversionRows,
      settingRows
    ] = await Promise.all([
      sql`select id, name, contact_name as "contactName", phone, email, address, notes from suppliers order by name`,
      sql`
        select id, name, category, base_unit as "baseUnit", current_stock::float as "currentStock",
          reorder_level::float as "reorderLevel", latest_unit_cost::float as "latestUnitCost",
          supplier_id as "supplierId", expiry_tracking_enabled as "expiryTrackingEnabled",
          default_expiry_days as "defaultExpiryDays", notes, reserved_stock::float as "reservedStock",
          expiry_date::text as "expiryDate"
        from ingredients
        where active = true
        order by category, name
      `,
      sql`select id, name, category, description, active from products where active = true order by category, name`,
      sql`
        select id, product_id as "productId", name, category, base_yield_quantity::float as "baseYieldQuantity",
          yield_unit as "yieldUnit", instructions, notes, active, updated_at::date::text as "updatedAt"
        from recipes
        where active = true
        order by name
      `,
      sql`
        select id, recipe_id as "recipeId", ingredient_id as "ingredientId", quantity::float, unit,
          waste_percentage::float as "wastePercentage", notes
        from recipe_items
        order by recipe_id, id
      `,
      sql`
        select id, customer_name as "customerName", customer_phone as "customerPhone", due_date::text as "dueDate",
          delivery_method as "deliveryMethod", status, payment_status as "paymentStatus",
          production_status as "productionStatus", stock_status as "stockStatus", notes
        from orders
        order by due_date, customer_name
      `,
      sql`
        select id, order_id as "orderId", product_id as "productId", recipe_id as "recipeId",
          requested_yield_quantity::float as "requestedYieldQuantity", yield_unit as "yieldUnit",
          quantity_multiplier::float as "quantityMultiplier", notes
        from order_items
        order by order_id, id
      `,
      sql`
        select id, ingredient_id as "ingredientId", movement_type as "movementType",
          quantity_change::float as "quantityChange", unit, related_order_id as "relatedOrderId",
          related_order_item_id as "relatedOrderItemId", related_purchase_id as "relatedPurchaseId",
          note, created_by as "createdBy", created_at as "createdAt"
        from inventory_movements
        order by created_at desc
        limit 200
      `,
      sql`
        select id, ingredient_id as "ingredientId", from_unit as "fromUnit", to_unit as "toUnit",
          conversion_factor::float as "conversionFactor", conversion_type as "conversionType",
          confidence_level as "confidenceLevel", source, verified, notes, updated_at::date::text as "updatedAt"
        from conversion_rules
        order by ingredient_id, from_unit
      `,
      sql`
        select business_name as "businessName", currency, default_deduction_stage as "defaultDeductionStage",
          allow_negative_inventory as "allowNegativeInventory",
          require_ai_conversion_confirmation as "requireAiConversionConfirmation",
          gram_rounding_preference as "gramRoundingPreference",
          egg_rounding_preference as "eggRoundingPreference"
        from settings
        order by updated_at desc
        limit 1
      `
    ]);

    res.json({
      suppliers: supplierRows,
      ingredients: ingredientRows,
      products: productRows,
      recipes: recipeRows.map((recipe) => ({
        ...recipe,
        instructions: Array.isArray(recipe.instructions) ? recipe.instructions : String(recipe.instructions ?? "").split("\n").filter(Boolean)
      })),
      recipeItems: recipeItemRows,
      orders: orderRows,
      orderItems: orderItemRows,
      inventoryMovements: movementRows,
      conversionRules: conversionRows,
      settings: first(settingRows) ?? {
        businessName: "Pastry County",
        currency: "NGN",
        defaultDeductionStage: "production_completion",
        allowNegativeInventory: false,
        requireAiConversionConfirmation: true,
        gramRoundingPreference: 5,
        eggRoundingPreference: "nearest_whole_egg"
      }
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/inventory-movements", requireDatabase, async (req, res, next) => {
  try {
    const { ingredientId, movementType, quantityChange, unit, note, createdBy = "system" } = req.body;
    const [movementRows] = await sql.transaction((txn) => [
      txn`
        insert into inventory_movements (id, ingredient_id, movement_type, quantity_change, unit, note, created_by)
        values (${`mov-${Date.now()}`}, ${ingredientId}, ${movementType}, ${quantityChange}, ${unit}, ${note}, ${createdBy})
        returning id
      `,
      txn`
        update ingredients
        set current_stock = current_stock + ${quantityChange}, updated_at = now()
        where id = ${ingredientId}
      `
    ]);
    res.status(201).json({ id: first(movementRows).id });
  } catch (error) {
    next(error);
  }
});

app.post("/api/orders/:orderId/produced", requireDatabase, async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const requirements = await sql`
      select ri.ingredient_id, ri.unit, sum(ri.quantity * oi.requested_yield_quantity / r.base_yield_quantity * oi.quantity_multiplier) as quantity
      from order_items oi
      join recipes r on r.id = oi.recipe_id
      join recipe_items ri on ri.recipe_id = r.id
      where oi.order_id = ${orderId}
      group by ri.ingredient_id, ri.unit
    `;
    await sql.transaction((txn) => [
      ...requirements.flatMap((requirement, index) => [
        txn`
          insert into inventory_movements (id, ingredient_id, movement_type, quantity_change, unit, related_order_id, note, created_by)
          values (${`mov-${Date.now()}-${index}`}, ${requirement.ingredient_id}, 'production_use', ${-Number(requirement.quantity)}, ${requirement.unit}, ${orderId}, 'Deducted when order was marked produced', 'system')
        `,
        txn`
          update ingredients
          set current_stock = current_stock - ${Number(requirement.quantity)}, updated_at = now()
          where id = ${requirement.ingredient_id}
        `
      ]),
      txn`update orders set status = 'Produced', production_status = 'Completed', updated_at = now() where id = ${orderId}`
    ]);
    res.json({ produced: true });
  } catch (error) {
    next(error);
  }
});

app.use(express.static(path.join(rootDir, "dist")));
app.get("*", (_req, res) => {
  res.sendFile(path.join(rootDir, "dist", "index.html"));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: error.message ?? "Unexpected server error" });
});

app.listen(port, () => {
  console.log(`Pastry County Kitchen OS API listening on http://localhost:${port}`);
});
