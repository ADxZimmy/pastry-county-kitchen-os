// Business rules shared by the API and the device-mode local engine.
//
// Phase 016 introduced accounts whose kitchen data lives in the browser rather
// than in Postgres. Those accounts still have to obey the same order lifecycle,
// the same FEFO consumption order, the same hold and deduction stages and the
// same role table as the server — so the rules that do not need a database live
// here, and api/_actions.js imports and re-exports them rather than keeping a
// second copy. shared/engine-parity.test.js pins that arrangement by reference
// identity, so a re-implementation on either side fails a test instead of
// quietly drifting.
//
// Everything in this file is pure and dependency-free: no SQL, no Node built-ins,
// no browser APIs. Rules that genuinely need to read the database (requirements
// for an order, reservation balances, the deduction transaction) stay on the
// server and are reimplemented against an in-memory workspace by the local
// engine, held to shared/engine-parity-fixtures.json.

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

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

export function nonNegative(value, label) {
  if (value < 0) {
    throw Object.assign(new Error(`${label} cannot be negative.`), { statusCode: 400 });
  }
  return value;
}

export function positive(value, label) {
  if (value <= 0) {
    throw Object.assign(new Error(`${label} must be greater than zero.`), { statusCode: 400 });
  }
  return value;
}

export function actorLabel(actor) {
  return actor?.fullName || actor?.email || actor?.sub || "system";
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

export function normalizeUnit(unit, fallback = "g") {
  return String(unit || fallback);
}

export function directUnitFactor(fromUnit, toUnit) {
  if (fromUnit === toUnit) return 1;
  const direct = {
    "kg:g": 1000,
    "g:kg": 0.001,
    "litre:ml": 1000,
    "ml:litre": 0.001
  };
  return direct[`${fromUnit}:${toUnit}`];
}

export function convertPurchaseQuantity(quantity, purchaseUnit, baseUnit) {
  const factor = directUnitFactor(purchaseUnit, baseUnit);
  if (!factor) {
    throw Object.assign(new Error(`Purchase unit ${purchaseUnit} cannot be converted to base unit ${baseUnit}. Use matching units or kg/g and litre/ml pairs.`), { statusCode: 400 });
  }
  return quantity * factor;
}

// Recipe-line conversion. Unlike a purchase conversion this falls back to the
// stored rule factor when there is no direct relationship, which is how an
// ingredient-specific rule ("1 cup flour = 120 g") takes effect.
export function conversionFactor(fromUnit, toUnit, ruleFactor) {
  if (fromUnit === toUnit) return 1;
  const direct = {
    "kg:g": 1000,
    "g:kg": 0.001,
    "litre:ml": 1000,
    "ml:litre": 0.001,
    "tablespoon:ml": 15,
    "teaspoon:ml": 5
  };
  return direct[`${fromUnit}:${toUnit}`] ?? Number(ruleFactor ?? 1);
}

export const movementTypes = new Set(["purchase", "production_use", "reservation", "reservation_release", "adjustment", "waste", "return", "correction"]);

export const RECIPE_ITEM_UNITS = ["g", "kg", "ml", "litre", "pcs", "cup", "tablespoon", "teaspoon", "pack", "roll", "egg", "yolk", "white"];

// Generic kitchen conversions seeded into every workspace. These are common
// knowledge rather than anyone's business data, which is why a new device
// workspace starts with them instead of starting blank.
export const auditConversionRuleSpecs = [
  { id: "cr-flour", ingredientId: "flour", fromUnit: "cup", toUnit: "g", conversionFactor: 120, confidenceLevel: "High" },
  { id: "cr-sugar", ingredientId: "sugar", fromUnit: "cup", toUnit: "g", conversionFactor: 200, confidenceLevel: "High" },
  { id: "cr-cocoa", ingredientId: "cocoa", fromUnit: "cup", toUnit: "g", conversionFactor: 85, confidenceLevel: "High" },
  { id: "cr-oil", ingredientId: "coconut-oil", fromUnit: "cup", toUnit: "ml", conversionFactor: 240, confidenceLevel: "High" },
  { id: "cr-egg", ingredientId: "eggs", fromUnit: "egg", toUnit: "g", conversionFactor: 50, confidenceLevel: "Medium" },
  { id: "cr-yolk", ingredientId: "egg-yolks", fromUnit: "yolk", toUnit: "g", conversionFactor: 18, confidenceLevel: "Medium" },
  { id: "cr-white", ingredientId: "egg-whites", fromUnit: "white", toUnit: "g", conversionFactor: 30, confidenceLevel: "Medium" }
];

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export const actionRoles = {
  "archive.list": ["Owner/Admin", "Inventory Manager"],
  "archive.restore": ["Owner/Admin"],
  "ingredient.save": ["Owner/Admin", "Inventory Manager"],
  "ingredient.delete": ["Owner/Admin"],
  "ingredient.restore": ["Owner/Admin", "Inventory Manager"],
  "inventory.adjust": ["Owner/Admin", "Inventory Manager"],
  "supplier.save": ["Owner/Admin", "Inventory Manager"],
  "supplier.delete": ["Owner/Admin"],
  "import.extract": ["Owner/Admin", "Baker", "Inventory Manager"],
  "import.commit": ["Owner/Admin", "Baker", "Inventory Manager"],
  "recipe.save": ["Owner/Admin", "Baker"],
  "recipe.delete": ["Owner/Admin"],
  "order.save": ["Owner/Admin", "Baker", "Inventory Manager"],
  "order.reserve": ["Owner/Admin", "Baker", "Inventory Manager"],
  "order.releaseReservation": ["Owner/Admin", "Inventory Manager"],
  "order.produce": ["Owner/Admin", "Baker"],
  "order.delete": ["Owner/Admin"],
  "order.status": ["Owner/Admin", "Baker", "Inventory Manager"],
  "production.batchStatus": ["Owner/Admin", "Baker"],
  "shopping.purchaseSuggested": ["Owner/Admin", "Inventory Manager"],
  "conversion.save": ["Owner/Admin", "Baker"],
  "conversion.verify": ["Owner/Admin", "Baker"],
  "conversion.applyToRecipeItem": ["Owner/Admin", "Baker"],
  "conversion.delete": ["Owner/Admin"],
  "settings.save": ["Owner/Admin"],
  "user.save": ["Owner/Admin"],
  "user.disable": ["Owner/Admin"],
  "user.revokeSessions": ["Owner/Admin"],
  "notification.lowStockEmail": ["Owner/Admin", "Inventory Manager"]
};

export function allowedRolesForAction(action) {
  if (action === "schema.ensure") return ["Owner/Admin"];
  return actionRoles[action] ?? ["Owner/Admin"];
}

export function canRolePerformAction(role, action) {
  return allowedRolesForAction(action).includes(role);
}

// Who receives a low-stock alert is derived from the app's own records, not from
// an address typed into settings that goes stale the moment staff change: the
// people allowed to ACT on the alert are the people who get it, plus whoever
// raised it. The optional settings address is kept as an extra recipient for a
// shared operations mailbox.
export function lowStockRecipients({ actor, staff = [], additional = "" } = {}) {
  const seen = new Set();
  const ordered = [];
  const add = (value) => {
    const email = String(value ?? "").trim();
    if (!email) return;
    const key = email.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    ordered.push(email);
  };

  add(actor?.email);
  for (const member of staff) add(member?.email);
  add(additional);
  return ordered;
}

// ---------------------------------------------------------------------------
// Order lifecycle
// ---------------------------------------------------------------------------

// Canonical order lifecycle. Both engines enforce these transitions so an invalid
// jump (e.g. Draft/Confirmed straight to Produced, a backwards move, or any
// escape from a terminal state) is rejected even when called directly, not just
// hidden by button state. Same-status is an idempotent no-op.
export const orderStatusTransitions = {
  "Draft": ["Confirmed", "Cancelled"],
  "Confirmed": ["Stock Reserved", "In Production", "Cancelled"],
  "Stock Reserved": ["Confirmed", "In Production", "Produced", "Cancelled"],
  "In Production": ["Stock Reserved", "Produced", "Cancelled"],
  "Produced": ["Delivered"],
  "Delivered": [],
  "Cancelled": []
};

export function isValidOrderTransition(from, to) {
  if (!from || from === to) return true;
  return (orderStatusTransitions[from] ?? []).includes(to);
}

export function productionCompletionPreflight(status) {
  if (status === "Produced") return { produced: false, alreadyProduced: true };
  if (!["Stock Reserved", "In Production"].includes(status)) {
    throw Object.assign(new Error("Start production before marking this order as produced."), { statusCode: 409 });
  }
  return null;
}

// Guard a reviewed conversion against a stale write: the review was opened
// against a specific before-value, so if the stored line has moved since, refuse
// rather than silently overwriting someone else's edit.
export function conversionApplyConflict(current, expected) {
  if (!current) return "Recipe ingredient not found.";
  const sameQuantity = Math.abs(Number(current.quantity) - Number(expected.quantity)) < 1e-6;
  const sameUnit = String(current.unit) === String(expected.unit);
  if (sameQuantity && sameUnit) return null;
  return `This ingredient line is now ${current.quantity}${current.unit}, not ${expected.quantity}${expected.unit}. Reopen the conversion review and check the current value.`;
}

export function archiveTableForEntity(entityType) {
  const tableMap = {
    ingredient: "ingredients",
    recipe: "recipes",
    order: "orders",
    supplier: "suppliers",
    conversion: "conversion_rules"
  };
  const tableName = tableMap[entityType];
  if (!tableName) throw Object.assign(new Error("Unsupported archive type."), { statusCode: 400 });
  return tableName;
}

// ---------------------------------------------------------------------------
// Stock: shortages, FEFO, and the hold/deduct stages
// ---------------------------------------------------------------------------

export function shortageSummary(shortages) {
  return shortages
    .map((item) => `${item.ingredientName || item.ingredientId || item.ingredient_id}: short ${Number(item.shortageQuantity ?? item.shortage_quantity ?? 0).toFixed(1)}${item.unit || ""}`)
    .join(", ");
}

export function productionShortageForRequirement(requirement, ingredient, reservedForOrder = 0) {
  const requiredQuantity = Number(requirement.quantity);
  const currentStock = Number(ingredient?.current_stock ?? ingredient?.currentStock ?? 0);
  const reservedStock = Number(ingredient?.reserved_stock ?? ingredient?.reservedStock ?? 0);
  const usableStock = currentStock - Math.max(0, reservedStock - Math.max(0, Number(reservedForOrder)));
  const shortageQuantity = Math.max(0, requiredQuantity - usableStock);
  if (shortageQuantity <= 0) return null;
  return {
    ingredientId: requirement.ingredient_id ?? requirement.ingredientId,
    ingredientName: ingredient?.name || requirement.ingredient_name || requirement.ingredientName || requirement.ingredient_id || requirement.ingredientId,
    unit: requirement.unit,
    requiredQuantity,
    availableQuantity: usableStock,
    shortageQuantity
  };
}

// Consume lots oldest-expiry-first. The caller supplies the lots already sorted
// (expiry nulls last, then received, then created) because that ordering is a
// database index on the server and an in-memory sort locally; the split itself is
// the same arithmetic either way. A shortfall simply stops — aggregate stock
// still falls by the full amount, which is how a backorder shows up as lots and
// stock disagreeing rather than as a silent failure.
export function planBatchDeductions(batches, quantity) {
  let remaining = Number(quantity);
  return batches.flatMap((batch) => {
    if (remaining <= 0) return [];
    const take = Math.min(remaining, Number(batch.quantity_remaining ?? batch.quantityRemaining ?? 0));
    remaining -= take;
    return take > 0 ? [{ batchId: batch.id, quantity: take }] : [];
  });
}

export const DEDUCTION_STAGES = ["confirmation", "production_start", "production_completion"];

// When stock is HELD is a separate question from when it is DEDUCTED.
//
// Deducting only at production completion means a shortage caused by a second
// order is discovered after the first has already been baked. Holding stock when
// an order is confirmed makes the clash visible while it can still be acted on:
// the ingredients stop counting as available to anything else, without leaving
// the building.
//
// Holding is not deducting. Held stock is still physically present and still
// deducts exactly once, at the configured deduction stage, which also releases
// the hold in the same statement.
export const STOCK_HOLD_STAGES = ["order_confirmation", "production_start", "none"];

export function normalizeStockHoldStage(value) {
  return STOCK_HOLD_STAGES.includes(value) ? value : "order_confirmation";
}

// Statuses that should be holding ingredients. A Draft is not a commitment, so
// it holds nothing; anything already produced or cancelled has either consumed
// or released its hold.
export const HOLDING_STATUSES = ["Confirmed", "Stock Reserved", "In Production"];

export function shouldHoldStockForStatus(status, holdStage) {
  if (normalizeStockHoldStage(holdStage) !== "order_confirmation") return false;
  return HOLDING_STATUSES.includes(String(status));
}

export function normalizeDeductionStage(value) {
  return DEDUCTION_STAGES.includes(value) ? value : "production_completion";
}

export function wasteFromQc(qcLog, qcInput = {}) {
  return num(qcInput.wasteQuantity) > 0
    ? num(qcInput.wasteQuantity)
    : Math.max(0, Number(qcLog?.expectedYieldQuantity ?? 0) - Number(qcLog?.actualYieldQuantity ?? 0));
}

// ---------------------------------------------------------------------------
// Purchasing
// ---------------------------------------------------------------------------

export function normalizeShoppingPurchaseInput(item, ingredientRow, index = 0) {
  const ingredientId = required(item?.ingredientId, "Ingredient");
  if (!ingredientRow) throw Object.assign(new Error("Ingredient not found."), { statusCode: 404 });
  const quantity = positive(num(item.purchaseQuantity ?? item.suggestedBuyQuantity), "Purchase quantity");
  const unitCostInput = positive(num(item.unitCost), "Unit cost");
  const purchasePrice = item.purchasePrice === undefined ? quantity * unitCostInput : positive(num(item.purchasePrice), "Purchase price");
  return {
    index,
    purchaseId: id(`pur-${index}`),
    ingredientId,
    supplierId: item.supplierId || ingredientRow.supplier_id || ingredientRow.supplierId || null,
    quantity,
    unit: normalizeUnit(item.unit, ingredientRow.base_unit ?? ingredientRow.baseUnit),
    purchasePrice,
    unitCost: purchasePrice / quantity,
    expiryDate: item.expiryDate || null,
    note: item.note || "Marked purchased from shopping list"
  };
}
