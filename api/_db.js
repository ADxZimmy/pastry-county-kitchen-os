import { neon } from "@neondatabase/serverless";

export function getSql() {
  if (!process.env.DATABASE_URL) {
    throw Object.assign(new Error("DATABASE_URL is not configured in Vercel environment variables."), { statusCode: 503 });
  }
  return neon(process.env.DATABASE_URL);
}

export function sendError(res, error) {
  const status = error.statusCode ?? 500;
  res.status(status).json({ error: error.message ?? "Unexpected server error" });
}

export const first = (rows) => rows[0];

export async function loadKitchenSnapshot() {
  const sql = getSql();
  await sql`alter table orders add column if not exists archived boolean not null default false`;
  await sql`alter table suppliers add column if not exists default_currency text not null default 'NGN'`;
  await sql`alter table suppliers add column if not exists lead_time_days integer not null default 2`;
  await sql`alter table suppliers add column if not exists supplied_ingredient_ids text[] not null default '{}'`;
  await sql`alter table settings add column if not exists safety_margin_percentage numeric(6,3) not null default 10`;
  await sql`alter table settings add column if not exists default_tax_percentage numeric(6,3) not null default 0`;
  await sql`alter table settings add column if not exists low_stock_notification_email text`;
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
    sql`select id, name, contact_name as "contactName", phone, email, address, default_currency as "defaultCurrency", lead_time_days as "leadTimeDays", supplied_ingredient_ids as "suppliedIngredientIds", notes from suppliers order by name`,
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
      select recipe_items.id, recipe_id as "recipeId", ingredient_id as "ingredientId", quantity::float, unit,
        waste_percentage::float as "wastePercentage", recipe_items.notes
      from recipe_items
      join recipes on recipes.id = recipe_items.recipe_id
      where recipes.active = true
      order by recipe_id, id
    `,
    sql`
      select id, customer_name as "customerName", customer_phone as "customerPhone", due_date::text as "dueDate",
        delivery_method as "deliveryMethod", status, payment_status as "paymentStatus",
        production_status as "productionStatus", stock_status as "stockStatus", notes
      from orders
      where coalesce(archived, false) = false
      order by due_date, customer_name
    `,
    sql`
      select order_items.id, order_id as "orderId", product_id as "productId", recipe_id as "recipeId",
        requested_yield_quantity::float as "requestedYieldQuantity", yield_unit as "yieldUnit",
        quantity_multiplier::float as "quantityMultiplier", order_items.notes
      from order_items
      join orders on orders.id = order_items.order_id
      where coalesce(orders.archived, false) = false
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
      eggRoundingPreference: "nearest_whole_egg",
      safetyMarginPercentage: 10,
      defaultTaxPercentage: 0,
      lowStockNotificationEmail: ""
    }
  };
}
