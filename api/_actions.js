import bcrypt from "bcryptjs";
import { Resend } from "resend";
import { ensureSessionColumns, sessionAccessError } from "./_auth.js";
import { revokeAllUserSessions } from "./_sessions.js";
import { extractImportDraft, importParserVersion } from "./_imports.js";
import { validatePositiveNumber, validateQuantityIncrement } from "../shared/policy.js";

export { sessionAccessError } from "./_auth.js";

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

function directUnitFactor(fromUnit, toUnit) {
  if (fromUnit === toUnit) return 1;
  const direct = {
    "kg:g": 1000,
    "g:kg": 0.001,
    "litre:ml": 1000,
    "ml:litre": 0.001
  };
  return direct[`${fromUnit}:${toUnit}`];
}

function convertPurchaseQuantity(quantity, purchaseUnit, baseUnit) {
  const factor = directUnitFactor(purchaseUnit, baseUnit);
  if (!factor) {
    throw Object.assign(new Error(`Purchase unit ${purchaseUnit} cannot be converted to base unit ${baseUnit}. Use matching units or kg/g and litre/ml pairs.`), { statusCode: 400 });
  }
  return quantity * factor;
}

const movementTypes = new Set(["purchase", "production_use", "reservation", "reservation_release", "adjustment", "waste", "return", "correction"]);
let decimalOperationalColumnsReady = false;
let auditConversionRulesReady = false;
let orderEventsBackfilled = false;
const auditConversionRuleSpecs = [
  { id: "cr-flour", ingredientId: "flour", fromUnit: "cup", toUnit: "g", conversionFactor: 120, confidenceLevel: "High" },
  { id: "cr-sugar", ingredientId: "sugar", fromUnit: "cup", toUnit: "g", conversionFactor: 200, confidenceLevel: "High" },
  { id: "cr-cocoa", ingredientId: "cocoa", fromUnit: "cup", toUnit: "g", conversionFactor: 85, confidenceLevel: "High" },
  { id: "cr-oil", ingredientId: "coconut-oil", fromUnit: "cup", toUnit: "ml", conversionFactor: 240, confidenceLevel: "High" },
  { id: "cr-egg", ingredientId: "eggs", fromUnit: "egg", toUnit: "g", conversionFactor: 50, confidenceLevel: "Medium" },
  { id: "cr-yolk", ingredientId: "egg-yolks", fromUnit: "yolk", toUnit: "g", conversionFactor: 18, confidenceLevel: "Medium" },
  { id: "cr-white", ingredientId: "egg-whites", fromUnit: "white", toUnit: "g", conversionFactor: 30, confidenceLevel: "Medium" }
];
const actionRoles = {
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

// Canonical order lifecycle. The API enforces these transitions so an invalid
// jump (e.g. Draft/Confirmed straight to Produced, a backwards move, or any
// escape from a terminal state) is rejected even when called directly, not just
// hidden by button state. Same-status is an idempotent no-op.
const orderStatusTransitions = {
  "Draft": ["Confirmed", "Cancelled"],
  "Confirmed": ["Stock Reserved", "In Production", "Cancelled"],
  "Stock Reserved": ["Confirmed", "In Production", "Produced", "Cancelled"],
  "In Production": ["Stock Reserved", "Produced", "Cancelled"],
  "Produced": ["Delivered"],
  "Delivered": [],
  "Cancelled": []
};

export const RECIPE_ITEM_UNITS = ["g", "kg", "ml", "litre", "pcs", "cup", "tablespoon", "teaspoon", "pack", "roll", "egg", "yolk", "white"];

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

export function isValidOrderTransition(from, to) {
  if (!from || from === to) return true;
  return (orderStatusTransitions[from] ?? []).includes(to);
}

async function requirePermission(sql, action, actor) {
  const missingActorError = sessionAccessError(actor, { active: true });
  if (missingActorError) throw Object.assign(new Error(missingActorError.message), { statusCode: missingActorError.statusCode });
  if (!canRolePerformAction(actor.role, action)) {
    throw Object.assign(new Error(`${actor.role} cannot perform ${action}.`), { statusCode: 403 });
  }
  await ensureSessionColumns(sql);
  const rows = await sql`
    select active, extract(epoch from session_revoked_at)::bigint as revoked_at
    from app_users
    where id = ${actor.sub}
    limit 1
  `;
  const sessionError = sessionAccessError(actor, rows[0]);
  if (sessionError) throw Object.assign(new Error(sessionError.message), { statusCode: sessionError.statusCode });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendResendEmail({ to, subject, text }) {
  if (!to) return { status: "missing_recipient" };
  if (!process.env.RESEND_API_KEY) return { status: "logged_missing_resend_key" };
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from || /onboarding@resend\.dev/i.test(from)) return { status: "missing_sender_domain" };
  const resend = new Resend(process.env.RESEND_API_KEY);
  const htmlLines = String(text).split(/\n+/).filter(Boolean).map((line) => `<tr><td style="padding:12px 14px;border-bottom:1px solid #eadccd;">${escapeHtml(line)}</td></tr>`).join("");
  const appUrl = process.env.PUBLIC_APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://pastry-county-kitchen-os.vercel.app");
  const { data, error } = await resend.emails.send({
    from,
    to,
    subject,
    text,
    html: `<!doctype html><html><body style="margin:0;background:#fbf7ef;font-family:Inter,Arial,sans-serif;color:#24160d;"><div style="max-width:640px;margin:0 auto;padding:28px;"><div style="background:#fffaf1;border:1px solid #dcc8b7;border-radius:18px;overflow:hidden;"><div style="background:#2c1a10;color:#fff;padding:22px 26px;"><p style="margin:0 0 6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#f6d8ac;">Pastry County Kitchen OS</p><h1 style="margin:0;font-size:24px;line-height:1.2;">${escapeHtml(subject)}</h1></div><div style="padding:24px 26px;"><p style="margin:0 0 16px;color:#6d5a4b;">The kitchen inventory has items that need restocking attention before production continues.</p><table style="border-collapse:collapse;width:100%;background:#fffdf8;border:1px solid #eadccd;border-radius:12px;overflow:hidden;">${htmlLines}</table><p style="margin:22px 0;"><a href="${appUrl}" style="display:inline-block;background:#c26116;color:white;text-decoration:none;padding:12px 18px;border-radius:999px;font-weight:700;">Open Kitchen OS</a></p><p style="margin:0;color:#6d5a4b;font-size:13px;">Sent to the configured low-stock notification address. If this alert is no longer needed, update the notification email in Settings.</p></div></div><p style="text-align:center;color:#8a7665;font-size:12px;margin:18px 0 0;">Pastry County Kitchen OS · Operational inventory alert</p></div></body></html>`
  });
  if (error) return { status: "send_failed", error: error.message || String(error) };
  return { status: "sent", providerId: data?.id };
}

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

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function nonNegativeMoney(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw Object.assign(new Error(`${label} must be a number of zero or greater.`), { statusCode: 400 });
  }
  return parsed;
}

// The single authoritative order-pricing contract. The API always recomputes
// every derived total from validated raw inputs and ignores any client-supplied
// totals, so no fabricated or tampered figure can reach a margin calculation.
// netTotal is the ex-tax, ex-delivery revenue used as the margin base.
export function computeOrderPricing({ lines = [], deliveryFee = 0, discountAmount = 0, taxRate = 0, amountPaid = 0 } = {}) {
  const normalizedLines = (Array.isArray(lines) ? lines : []).map((line, index) => {
    const saleQuantity = nonNegativeMoney(line?.saleQuantity ?? 0, `Line ${index + 1} sale quantity`);
    const unitSellingPrice = nonNegativeMoney(line?.unitSellingPrice ?? 0, `Line ${index + 1} unit price`);
    return { saleQuantity, unitSellingPrice, lineTotal: round2(saleQuantity * unitSellingPrice) };
  });
  const subtotal = round2(normalizedLines.reduce((sum, line) => sum + line.lineTotal, 0));
  const discount = Math.min(round2(nonNegativeMoney(discountAmount, "Discount")), subtotal);
  const netTotal = round2(subtotal - discount);
  const rate = nonNegativeMoney(taxRate, "Tax rate");
  const taxAmount = round2((netTotal * rate) / 100);
  const delivery = round2(nonNegativeMoney(deliveryFee, "Delivery fee"));
  const grossTotal = round2(netTotal + taxAmount + delivery);
  const paid = round2(nonNegativeMoney(amountPaid, "Amount paid"));
  return {
    lines: normalizedLines,
    subtotal,
    discountAmount: discount,
    deliveryFee: delivery,
    taxRate: rate,
    taxAmount,
    netTotal,
    grossTotal,
    amountPaid: paid,
    balance: round2(grossTotal - paid),
    hasPricing: normalizedLines.some((line) => line.unitSellingPrice > 0)
  };
}

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

export function safePurchasePersistenceError(error) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/invalid input syntax|numeric field overflow|violates check constraint/i.test(message)) {
    return Object.assign(new Error("Unable to save this purchase. Check the quantity and unit cost, then try again."), { statusCode: 400 });
  }
  return error;
}

const recipeFormulaTextFields = [
  "productFamily",
  "formulaVersion",
  "panProfile",
  "fillGuidance",
  "ovenTemperature",
  "bakeTimeRange",
  "mixingMethod",
  "restWindow",
  "chillWindow",
  "coolWindow",
  "targetDoneness",
  "sensoryCheckpoints",
  "storageServiceNotes"
];
const recipePrepTextFields = [
  "component",
  "stage",
  "ingredientState",
  "temperatureState",
  "dividedUse",
  "preparationNotes",
  "handlingWarning",
  "sourceLineName",
  "sourceFile",
  "sourceType",
  "sourceReference",
  "sourceText",
  "sourceSheet",
  "sourceWorkbook",
  "sourceWorkbookRevision",
  // Conversion provenance (010-B). Kept alongside the import/source evidence so
  // applying a conversion never erases where a line originally came from.
  "convertedFromUnit",
  "conversionRuleId",
  "conversionAppliedBy",
  "conversionAppliedAt"
];
const recipePrepNumberFields = [
  "sourcePackageQuantity",
  "sourcePackagePrice",
  "sourceNeededQuantity",
  "sourceLineAmount",
  "sourcePage",
  "sourceRow",
  "sourceColumn",
  "convertedFromQuantity"
];
const recipeTestBakeStatuses = new Set(["untested", "test_bake_needed", "tested", "production_ready"]);
const allergenFields = ["contains", "mayContain", "dietaryFlags"];
const allergenCrossContactRisks = new Set(["low", "medium", "high"]);
const storageTemperatures = new Set(["ambient", "cool_dry", "refrigerated", "frozen"]);
const storageTextFields = ["storageLocation", "handlingNotes"];
const costNumberFields = [
  "laborMinutes",
  "laborRatePerHour",
  "packagingCost",
  "overheadCost",
  "utilityCost",
  "failureAllowancePercentage",
  "yieldLossPercentage"
];
const conversionScopeTextFields = ["ingredientState", "temperatureState", "formulaContext"];
const qcTextFields = [
  "batchKey",
  "formulaVersion",
  "yieldUnit",
  "roomTemperature",
  "mixTemperature",
  "ovenTemperature",
  "sensoryNotes",
  "defects",
  "nextAdjustment"
];

function trimmedString(value) {
  const text = String(value ?? "").trim();
  return text ? text : undefined;
}

function positiveOptionalNumber(value) {
  const parsed = num(value);
  return parsed > 0 ? parsed : undefined;
}

function nonNegativeOptionalNumber(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = num(value);
  return parsed >= 0 ? parsed : undefined;
}

function stringList(value) {
  const raw = Array.isArray(value) ? value : String(value ?? "").split(",");
  return Array.from(new Set(raw.map((item) => String(item).trim()).filter(Boolean)));
}

export function normalizeRecipeFormulaMetadata(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const metadata = {};
  recipeFormulaTextFields.forEach((field) => {
    const text = trimmedString(source[field]);
    if (text) metadata[field] = text;
  });
  const panCount = positiveOptionalNumber(source.panCount);
  if (panCount !== undefined) metadata.panCount = panCount;
  const testBakeStatus = trimmedString(source.testBakeStatus);
  if (testBakeStatus && recipeTestBakeStatuses.has(testBakeStatus)) metadata.testBakeStatus = testBakeStatus;
  return metadata;
}

export function normalizeRecipeItemPrepState(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const prepState = {};
  recipePrepTextFields.forEach((field) => {
    const text = trimmedString(source[field]);
    if (text) prepState[field] = text;
  });
  const sequence = positiveOptionalNumber(source.sequence);
  if (sequence !== undefined) prepState.sequence = sequence;
  recipePrepNumberFields.forEach((field) => {
    const parsed = nonNegativeOptionalNumber(source[field]);
    if (parsed !== undefined) prepState[field] = parsed;
  });
  return prepState;
}

export function normalizeIngredientAllergenProfile(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const profile = {};
  allergenFields.forEach((field) => {
    const list = stringList(source[field]);
    if (list.length) profile[field] = list;
  });
  const crossContactRisk = trimmedString(source.crossContactRisk)?.toLowerCase();
  if (crossContactRisk && allergenCrossContactRisks.has(crossContactRisk)) profile.crossContactRisk = crossContactRisk;
  const labelNotes = trimmedString(source.labelNotes);
  if (labelNotes) profile.labelNotes = labelNotes;
  return profile;
}

export function normalizeIngredientStorageProfile(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const profile = {};
  const storageTemperature = trimmedString(source.storageTemperature)?.toLowerCase();
  if (storageTemperature && storageTemperatures.has(storageTemperature)) profile.storageTemperature = storageTemperature;
  storageTextFields.forEach((field) => {
    const text = trimmedString(source[field]);
    if (text) profile[field] = text;
  });
  const openedShelfLifeDays = positiveOptionalNumber(source.openedShelfLifeDays);
  if (openedShelfLifeDays !== undefined) profile.openedShelfLifeDays = openedShelfLifeDays;
  if (source.humiditySensitive !== undefined) profile.humiditySensitive = bool(source.humiditySensitive);
  if (source.odorSensitive !== undefined) profile.odorSensitive = bool(source.odorSensitive);
  return profile;
}

export function normalizeRecipeCostProfile(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const profile = {};
  costNumberFields.forEach((field) => {
    const parsed = nonNegativeOptionalNumber(source[field]);
    if (parsed !== undefined) profile[field] = parsed;
  });
  const notes = trimmedString(source.notes);
  if (notes) profile.notes = notes;
  return profile;
}

export function normalizeConversionScope(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  return conversionScopeTextFields.reduce((acc, field) => {
    const text = trimmedString(source[field]);
    if (text) acc[field] = text;
    return acc;
  }, {});
}

export function normalizeProductionQcLog(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const log = {};
  qcTextFields.forEach((field) => {
    const text = trimmedString(source[field]);
    if (text) log[field] = text;
  });
  ["expectedYieldQuantity", "actualYieldQuantity", "bakeTimeMinutes", "restTimeMinutes"].forEach((field) => {
    const parsed = nonNegativeOptionalNumber(source[field]);
    if (parsed !== undefined) log[field] = parsed;
  });
  log.passedQc = source.passedQc === undefined ? true : bool(source.passedQc);
  return log;
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

function shortageSummary(shortages) {
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

function conversionFactor(fromUnit, toUnit, ruleFactor) {
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

async function requirementsForOrder(sql, orderId) {
  const rows = await sql`
    select ri.ingredient_id, ri.unit, ingredients.base_unit, conversion_rules.conversion_factor::float as conversion_factor,
      sum(ri.quantity * (1 + coalesce(ri.waste_percentage, 0) / 100) * oi.requested_yield_quantity / r.base_yield_quantity * oi.quantity_multiplier)::float as quantity
    from order_items oi
    join recipes r on r.id = oi.recipe_id
    join recipe_items ri on ri.recipe_id = r.id
    join ingredients on ingredients.id = ri.ingredient_id
    left join lateral (
      select conversion_factor
      from conversion_rules
      where conversion_rules.ingredient_id = ri.ingredient_id
        and conversion_rules.from_unit = ri.unit
        and conversion_rules.to_unit = ingredients.base_unit
        and conversion_rules.active = true
        and (conversion_rules.ingredient_state is null or lower(conversion_rules.ingredient_state) = lower(coalesce(ri.prep_state->>'ingredientState', '')))
        and (conversion_rules.temperature_state is null or lower(conversion_rules.temperature_state) = lower(coalesce(ri.prep_state->>'temperatureState', '')))
        and (conversion_rules.formula_context is null or lower(conversion_rules.formula_context) = lower(coalesce(r.formula_metadata->>'productFamily', r.category, '')))
      order by
        case when conversion_rules.ingredient_state is null then 0 else 1 end +
        case when conversion_rules.temperature_state is null then 0 else 1 end +
        case when conversion_rules.formula_context is null then 0 else 1 end desc,
        conversion_rules.verified desc,
        conversion_rules.updated_at desc
      limit 1
    ) conversion_rules on true
    where oi.order_id = ${orderId}
    group by ri.ingredient_id, ri.unit, ingredients.base_unit, conversion_rules.conversion_factor
  `;
  const requirements = new Map();
  rows.forEach((row) => {
    const unit = row.base_unit || row.unit;
    const quantity = Number(row.quantity) * conversionFactor(row.unit, unit, row.conversion_factor);
    const key = `${row.ingredient_id}:${unit}`;
    const existing = requirements.get(key) ?? { ingredient_id: row.ingredient_id, unit, quantity: 0 };
    existing.quantity += quantity;
    requirements.set(key, existing);
  });
  return Array.from(requirements.values());
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

async function reserveOrder(sql, orderId, actor = null) {
  const orderRows = await sql`select status from orders where id = ${orderId}`;
  if (!orderRows.length) throw Object.assign(new Error("Order not found."), { statusCode: 404 });
  if (["Produced", "Delivered", "Cancelled"].includes(orderRows[0].status)) {
    return { reserved: false, alreadyFinal: true };
  }
  const reserveActor = actorLabel(actor);

  const requirements = await requirementsForOrder(sql, orderId);
  const reservations = await reservationBalancesForOrder(sql, orderId);
  const plan = await Promise.all(requirements.map(async (item) => {
    const ingredientRows = await sql`
      select name, current_stock::float as current_stock, reserved_stock::float as reserved_stock
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
          values (${id(`mov-res-${index}`)}, ${item.ingredientId}, 'reservation', ${item.reserveQuantity}, ${item.unit}, ${orderId}, ${isComplete ? "Reserved stock for confirmed order" : "Partially reserved available stock for confirmed order"}, ${reserveActor})
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
      `,
      orderEventStatement(txn, {
        orderId,
        eventType: "reserved",
        actor,
        previousStatus: orderRows[0].status,
        newStatus: isComplete ? "Stock Reserved" : orderRows[0].status,
        metadata: { complete: isComplete, reservedLines: reservationsToCreate.length, shortages: shortages.length },
        note: isComplete ? "Stock reserved for order." : "Partial stock reserved; shortages remain."
      })
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
  await sql`alter table ingredients add column if not exists purchase_unit text`;
  await sql`alter table ingredients add column if not exists allergen_profile jsonb not null default '{}'`;
  await sql`alter table ingredients add column if not exists storage_profile jsonb not null default '{}'`;
  // Aggregate stock may go negative only via an explicit allowNegativeInventory
  // backorder at production; the app-level shortage/adjustment guards keep it >= 0
  // otherwise. FEFO lots stay >= 0 via greatest(0, ...).
  await sql`alter table ingredients drop constraint if exists ingredients_current_stock_check`;
  // Per-ingredient divisibility. Null falls back to the unit default (count units
  // whole, measured units divisible); legacy fractional counts are left alone.
  await sql`alter table ingredients add column if not exists allows_decimals boolean`;
  await sql`alter table ingredients add column if not exists minimum_increment numeric(14,4)`;
  await sql`update ingredients set purchase_unit = base_unit where purchase_unit is null or purchase_unit = ''`;
  await sql`alter table ingredients alter column purchase_unit set default 'g'`;
  await sql`alter table ingredients alter column purchase_unit set not null`;
  await sql`alter table suppliers add column if not exists default_currency text not null default 'NGN'`;
  await sql`alter table suppliers add column if not exists lead_time_days integer not null default 2`;
  await sql`alter table suppliers add column if not exists supplied_ingredient_ids text[] not null default '{}'`;
  await sql`alter table suppliers add column if not exists active boolean not null default true`;
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
  await sql`alter table app_users add column if not exists active boolean not null default true`;
  await sql`alter table app_users add column if not exists session_revoked_at timestamptz`;
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
    create table if not exists production_runs (
      id text primary key,
      order_id text not null references orders(id),
      batch_key text,
      actor text,
      planned_yield numeric(14,3),
      actual_yield numeric(14,3),
      waste_quantity numeric(14,3),
      qc_log_id text,
      created_at timestamptz not null default now(),
      unique (order_id)
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
  await sql`
    create table if not exists import_batches (
      id text primary key,
      source_name text not null,
      source_type text not null,
      parser_version text not null,
      actor text,
      status text not null default 'draft',
      summary jsonb not null default '{}'::jsonb,
      warnings jsonb not null default '[]'::jsonb,
      created_at timestamptz not null default now()
    )
  `;
  await ensureDecimalOperationalColumns(sql);
  await ensureAuditConversionRules(sql);
  await ensureOrderEventsBackfill(sql);
}

async function ensureDecimalOperationalColumns(sql) {
  if (decimalOperationalColumnsReady) return;
  await sql`alter table ingredients alter column current_stock type numeric(14,3) using current_stock::numeric`;
  await sql`alter table ingredients alter column reserved_stock type numeric(14,3) using reserved_stock::numeric`;
  await sql`alter table ingredients alter column reorder_level type numeric(14,3) using reorder_level::numeric`;
  await sql`alter table ingredients alter column latest_unit_cost type numeric(14,4) using latest_unit_cost::numeric`;
  await sql`alter table purchase_logs alter column purchase_quantity type numeric(14,3) using purchase_quantity::numeric`;
  await sql`alter table purchase_logs alter column purchase_price type numeric(14,2) using purchase_price::numeric`;
  await sql`alter table purchase_logs alter column converted_quantity_in_base_unit type numeric(14,3) using converted_quantity_in_base_unit::numeric`;
  await sql`alter table purchase_logs alter column cost_per_base_unit type numeric(14,4) using cost_per_base_unit::numeric`;
  await sql`alter table ingredient_batches alter column quantity_received type numeric(14,3) using quantity_received::numeric`;
  await sql`alter table ingredient_batches alter column quantity_remaining type numeric(14,3) using quantity_remaining::numeric`;
  await sql`alter table inventory_movements alter column quantity_change type numeric(14,3) using quantity_change::numeric`;
  decimalOperationalColumnsReady = true;
}

function conversionRuleMatches(row, rule) {
  return row
    && row.ingredient_id === rule.ingredientId
    && row.from_unit === rule.fromUnit
    && row.to_unit === rule.toUnit
    && Number(row.conversion_factor) === rule.conversionFactor
    && row.conversion_type === "ingredient_specific"
    && row.confidence_level === rule.confidenceLevel
    && row.source === "seed rule"
    && row.verified === true
    && row.active === true;
}

async function ensureAuditConversionRules(sql) {
  if (auditConversionRulesReady) return;
  for (const rule of auditConversionRuleSpecs) {
    const before = await rowById(sql, "conversion_rules", rule.id);
    await sql`
      insert into conversion_rules (id, ingredient_id, from_unit, to_unit, conversion_factor, conversion_type, confidence_level, source, verified, active, ingredient_state, temperature_state, formula_context)
      values (${rule.id}, ${rule.ingredientId}, ${rule.fromUnit}, ${rule.toUnit}, ${rule.conversionFactor}, 'ingredient_specific', ${rule.confidenceLevel}, 'seed rule', true, true, null, null, null)
      on conflict (id) do update set ingredient_id = excluded.ingredient_id, from_unit = excluded.from_unit, to_unit = excluded.to_unit,
        conversion_factor = excluded.conversion_factor, conversion_type = excluded.conversion_type, confidence_level = excluded.confidence_level,
        source = excluded.source, verified = excluded.verified, active = true, ingredient_state = null, temperature_state = null,
        formula_context = null, updated_at = now()
    `;
    if (!conversionRuleMatches(before, rule)) {
      await audit(sql, "conversion_rules", rule.id, before ? "repair" : "create", before, await rowById(sql, "conversion_rules", rule.id));
    }

    const duplicates = await sql`
      select *
      from conversion_rules
      where active = true
        and verified = true
        and ingredient_id = ${rule.ingredientId}
        and from_unit = ${rule.fromUnit}
        and to_unit = ${rule.toUnit}
        and ingredient_state is null
        and temperature_state is null
        and formula_context is null
        and id <> ${rule.id}
    `;
    for (const duplicate of duplicates) {
      await sql`update conversion_rules set active = false, updated_at = now() where id = ${duplicate.id}`;
      await audit(sql, "conversion_rules", duplicate.id, "archive_duplicate", duplicate, await rowById(sql, "conversion_rules", duplicate.id));
    }
  }
  auditConversionRulesReady = true;
}

export function actorLabel(actor) {
  return actor?.fullName || actor?.email || actor?.sub || "system";
}

async function audit(sql, entityType, entityId, action, beforeData, afterData, actor = null) {
  await sql`
    insert into audit_logs (id, entity_type, entity_id, action, before_data, after_data, actor)
    values (${id("audit")}, ${entityType}, ${entityId}, ${action}, ${beforeData ? JSON.stringify(beforeData) : null}, ${afterData ? JSON.stringify(afterData) : null}, ${actorLabel(actor)})
  `;
}

// Returns an order_events insert. Pass a transaction tag (txn) to include it in
// the same atomic write as the business change, or the plain sql tag to run it
// standalone. Human actions carry the authenticated actor; automated jobs pass null.
function orderEventStatement(runner, { orderId, eventType, actor = null, previousStatus = null, newStatus = null, metadata = {}, note = null }) {
  return runner`
    insert into order_events (id, order_id, event_type, actor_user_id, actor_name, previous_status, new_status, metadata, note)
    values (${id("oevt")}, ${orderId}, ${eventType}, ${actor?.sub ?? null}, ${actorLabel(actor)}, ${previousStatus}, ${newStatus}, ${JSON.stringify(metadata ?? {})}::jsonb, ${note})
  `;
}

async function ensureOrderEventsBackfill(sql) {
  if (orderEventsBackfilled) return;
  await sql`
    insert into order_events (id, order_id, event_type, actor_user_id, actor_name, previous_status, new_status, metadata, note, created_at)
    select 'oevt-backfill-' || orders.id, orders.id, 'created', null, 'system', null, null,
      jsonb_build_object('backfill', true), 'Backfilled from the order record creation date.', orders.created_at
    from orders
    where not exists (select 1 from order_events where order_events.order_id = orders.id)
    on conflict (id) do nothing
  `;
  orderEventsBackfilled = true;
}

async function rowById(sql, table, entityId) {
  if (table === "ingredients") return (await sql`select * from ingredients where id = ${entityId}`)[0] ?? null;
  if (table === "suppliers") return (await sql`select * from suppliers where id = ${entityId}`)[0] ?? null;
  if (table === "recipes") return (await sql`select * from recipes where id = ${entityId}`)[0] ?? null;
  if (table === "orders") return (await sql`select * from orders where id = ${entityId}`)[0] ?? null;
  if (table === "conversion_rules") return (await sql`select * from conversion_rules where id = ${entityId}`)[0] ?? null;
  if (table === "settings") return (await sql`select * from settings where id = ${entityId}`)[0] ?? null;
  if (table === "app_users") return (await sql`select id, email, full_name, role, active, session_revoked_at, updated_at from app_users where id = ${entityId}`)[0] ?? null;
  return null;
}

function createBatchFromPurchase(txn, item) {
  return txn`
    insert into ingredient_batches (id, ingredient_id, purchase_id, quantity_received, quantity_remaining, unit, expiry_date, notes)
    values (${id("batch")}, ${item.ingredientId}, ${item.purchaseId}, ${item.quantity}, ${item.quantity}, ${item.unit}, ${item.expiryDate || null}, ${item.note || "Purchased stock lot"})
  `;
}

function importNameKey(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function importSlug(value, fallback = "import") {
  return (importNameKey(value) || fallback).replace(/\s+/g, "-").slice(0, 42);
}

function canCommitInventoryImports(actor) {
  return ["Owner/Admin", "Inventory Manager"].includes(actor?.role);
}

function canCommitRecipeImports(actor) {
  return ["Owner/Admin", "Baker"].includes(actor?.role);
}

function canCommitConversionImports(actor) {
  return ["Owner/Admin", "Baker"].includes(actor?.role);
}

async function loadImportContext(sql) {
  const [ingredientRows, recipeRows, supplierRows] = await Promise.all([
    sql`select id, name, category, base_unit as "baseUnit", latest_unit_cost::float as "latestUnitCost" from ingredients where active = true order by name`,
    sql`select id, name, category from recipes where active = true order by name`,
    sql`select id, name from suppliers where active = true order by name`
  ]);
  return { ingredients: ingredientRows, recipes: recipeRows, suppliers: supplierRows };
}

async function commitImportDraft(sql, draft, actor) {
  if (!draft || typeof draft !== "object") throw Object.assign(new Error("Import draft is required."), { statusCode: 400 });
  const source = draft.source ?? {};
  const sourceName = String(source.name || "Import source");
  const actorLabel = actor?.email || actor?.sub || "system";
  const importBatchId = id("import");
  const context = await loadImportContext(sql);
  const ingredientByName = new Map(context.ingredients.map((item) => [importNameKey(item.name), item]));
  const recipeByName = new Map(context.recipes.map((item) => [importNameKey(item.name), item]));
  const supplierByName = new Map(context.suppliers.map((item) => [importNameKey(item.name), item]));
  const warnings = Array.isArray(draft.warnings) ? draft.warnings.map(String) : [];
  const createdIngredients = [];
  const createdSuppliers = [];
  const createdConversions = [];
  const createdRecipes = [];
  const skipped = [];
  const ingredientIdsByDraftName = new Map();
  const statements = [];

  const supplierDrafts = Array.isArray(draft.suppliers) ? draft.suppliers.filter((item) => item && item.selected !== false) : [];
  for (const supplier of supplierDrafts) {
    const name = required(supplier.name, "Supplier name");
    const existing = supplierByName.get(importNameKey(name));
    if (existing) {
      skipped.push({ type: "supplier", name, reason: "Already exists" });
      continue;
    }
    if (!canCommitInventoryImports(actor)) {
      skipped.push({ type: "supplier", name, reason: "Only Owner/Admin or Inventory Manager can import suppliers." });
      continue;
    }
    const supplierId = id("sup-import");
    supplierByName.set(importNameKey(name), { id: supplierId, name });
    createdSuppliers.push({ id: supplierId, name });
    statements.push((txn) => txn`
      insert into suppliers (id, name, contact_name, phone, email, address, default_currency, lead_time_days, notes, active)
      values (${supplierId}, ${name}, ${supplier.contactName || null}, ${supplier.phone || null}, ${supplier.email || null}, ${supplier.address || null}, ${supplier.defaultCurrency || "NGN"}, ${nonNegative(num(supplier.leadTimeDays, 2), "Lead time")}, ${supplier.notes || `Imported from ${sourceName}`}, true)
    `);
  }

  const ingredientDrafts = Array.isArray(draft.ingredients) ? draft.ingredients.filter((item) => item && item.selected !== false) : [];
  for (const ingredient of ingredientDrafts) {
    const name = required(ingredient.name, "Ingredient name");
    const existing = ingredientByName.get(importNameKey(name));
    if (existing) {
      ingredientIdsByDraftName.set(importNameKey(name), existing.id);
      skipped.push({ type: "ingredient", name, reason: "Matched existing ingredient" });
      continue;
    }
    if (!canCommitInventoryImports(actor)) {
      skipped.push({ type: "ingredient", name, reason: "Only Owner/Admin or Inventory Manager can create new ingredients from imports." });
      continue;
    }
    const supplierId = ingredient.supplierId || supplierByName.get(importNameKey(ingredient.supplierName))?.id || null;
    const ingredientId = id(`ing-${importSlug(name)}`);
    const baseUnit = normalizeUnit(ingredient.baseUnit || ingredient.unit || "g");
    const purchaseUnit = normalizeUnit(ingredient.purchaseUnit || baseUnit, baseUnit);
    ingredientIdsByDraftName.set(importNameKey(name), ingredientId);
    ingredientByName.set(importNameKey(name), { id: ingredientId, name, baseUnit });
    createdIngredients.push({ id: ingredientId, name });
    statements.push((txn) => txn`
      insert into ingredients (id, name, category, base_unit, purchase_unit, current_stock, reserved_stock, reorder_level, latest_unit_cost, supplier_id, notes, active)
      values (${ingredientId}, ${name}, ${ingredient.category || "Dry Goods"}, ${baseUnit}, ${purchaseUnit}, 0, 0, ${nonNegative(num(ingredient.reorderLevel), "Reorder level")}, ${nonNegative(num(ingredient.latestUnitCost), "Latest unit cost")}, ${supplierId}, ${ingredient.notes || `Imported from ${sourceName}`}, true)
    `);
  }

  const recipeDrafts = Array.isArray(draft.recipes) ? draft.recipes.filter((item) => item && item.selected !== false) : [];
  for (const recipe of recipeDrafts) {
    const name = required(recipe.name, "Recipe name");
    if (!canCommitRecipeImports(actor)) {
      skipped.push({ type: "recipe", name, reason: "Only Owner/Admin or Baker can import recipes." });
      continue;
    }
    if (recipeByName.has(importNameKey(name)) && !recipe.allowDuplicate) {
      throw Object.assign(new Error(`${name} already exists. Rename it in the import review or skip the duplicate.`), { statusCode: 409 });
    }
    const items = Array.isArray(recipe.items) ? recipe.items.filter((item) => item && item.selected !== false) : [];
    const unresolved = items.filter((item) => {
      const ingredientId = item.ingredientId || ingredientIdsByDraftName.get(importNameKey(item.ingredientName));
      return !ingredientId || num(item.quantity) <= 0;
    });
    if (unresolved.length) {
      throw Object.assign(new Error(`Resolve ${unresolved.length} ingredient line${unresolved.length === 1 ? "" : "s"} before importing ${name}.`), { statusCode: 400 });
    }
    if (!items.length) {
      throw Object.assign(new Error(`${name} has no ingredient lines to import.`), { statusCode: 400 });
    }
    const productId = id("prod-import");
    const recipeId = id("rec-import");
    const instructions = Array.isArray(recipe.instructions) ? recipe.instructions.map(String).filter(Boolean) : String(recipe.instructions || "").split(/\n+/).filter(Boolean);
    const formulaMetadata = normalizeRecipeFormulaMetadata({
      ...(recipe.formulaMetadata ?? {}),
      formulaVersion: recipe.formulaMetadata?.formulaVersion || `Imported from ${sourceName}`,
      testBakeStatus: recipe.formulaMetadata?.testBakeStatus || "test_bake_needed"
    });
    const costProfile = normalizeRecipeCostProfile(recipe.costProfile ?? {});
    const notes = recipe.notes || `Imported from ${sourceName}. Review source evidence before production use.`;
    createdRecipes.push({ id: recipeId, productId, name });
    recipeByName.set(importNameKey(name), { id: recipeId, name });
    statements.push(
      (txn) => txn`
        insert into products (id, name, category, description, active)
        values (${productId}, ${name}, ${required(recipe.category || "Imported", "Category")}, ${notes}, true)
      `,
      (txn) => txn`
        insert into recipes (id, product_id, name, category, base_yield_quantity, yield_unit, instructions, notes, formula_metadata, cost_profile, active)
        values (${recipeId}, ${productId}, ${name}, ${recipe.category || "Imported"}, ${num(recipe.baseYieldQuantity, 1)}, ${recipe.yieldUnit || "batch"}, ${instructions}, ${notes}, ${JSON.stringify(formulaMetadata)}::jsonb, ${JSON.stringify(costProfile)}::jsonb, true)
      `,
      ...items.map((item, index) => {
        const ingredientId = item.ingredientId || ingredientIdsByDraftName.get(importNameKey(item.ingredientName));
        const prepStateJson = JSON.stringify(normalizeRecipeItemPrepState({
          ...(item.prepState ?? {}),
          sourceLineName: item.prepState?.sourceLineName || item.ingredientName,
          sourceFile: item.prepState?.sourceFile || sourceName,
          sourceType: item.prepState?.sourceType || source.type || "import",
          sourceReference: item.prepState?.sourceReference || item.source?.text || sourceName,
          sourceText: item.prepState?.sourceText || item.source?.text,
          sequence: item.prepState?.sequence || index + 1
        }));
        return (txn) => txn`
          insert into recipe_items (id, recipe_id, ingredient_id, quantity, unit, waste_percentage, notes, prep_state)
          values (${id(`ri-import-${index}`)}, ${recipeId}, ${ingredientId}, ${num(item.quantity)}, ${normalizeUnit(item.unit)}, ${num(item.wastePercentage)}, ${item.notes || null}, ${prepStateJson}::jsonb)
        `;
      })
    );
  }

  const conversionDrafts = Array.isArray(draft.conversionRules) ? draft.conversionRules.filter((item) => item && item.selected !== false) : [];
  for (const rule of conversionDrafts) {
    if (!canCommitConversionImports(actor)) {
      skipped.push({ type: "conversion", name: `${rule.fromUnit} to ${rule.toUnit}`, reason: "Only Owner/Admin or Baker can import conversion rules." });
      continue;
    }
    const ingredientId = rule.ingredientId || ingredientIdsByDraftName.get(importNameKey(rule.ingredientName));
    if (!ingredientId) {
      skipped.push({ type: "conversion", name: rule.ingredientName || `${rule.fromUnit} to ${rule.toUnit}`, reason: "Ingredient was not resolved." });
      continue;
    }
    const ruleId = id("conv-import");
    createdConversions.push({ id: ruleId, ingredientId, fromUnit: rule.fromUnit, toUnit: rule.toUnit });
    const scope = normalizeConversionScope(rule);
    statements.push((txn) => txn`
      insert into conversion_rules (id, ingredient_id, from_unit, to_unit, conversion_factor, conversion_type, confidence_level, source, verified, active, ingredient_state, temperature_state, formula_context)
      values (${ruleId}, ${ingredientId}, ${required(rule.fromUnit, "From unit")}, ${required(rule.toUnit, "To unit")}, ${num(rule.conversionFactor, 1)}, 'ingredient_specific', ${rule.confidenceLevel || "Medium"}, ${rule.sourceLabel || `Imported from ${sourceName}`}, ${bool(rule.verified)}, true, ${scope.ingredientState || null}, ${scope.temperatureState || null}, ${scope.formulaContext || null})
    `);
  }

  const committedCount = createdRecipes.length + createdIngredients.length + createdSuppliers.length + createdConversions.length;
  const selectedCount = supplierDrafts.length + ingredientDrafts.length + recipeDrafts.length + conversionDrafts.length;
  if (!selectedCount) throw Object.assign(new Error("No selected import records were ready to commit."), { statusCode: 400 });
  if (!committedCount) {
    const reason = skipped[0]?.reason ? ` ${skipped[0].reason}` : "";
    throw Object.assign(new Error(`No import records were committed.${reason}`), { statusCode: 400, details: skipped });
  }

  statements.push((txn) => txn`
    insert into import_batches (id, source_name, source_type, parser_version, actor, status, summary, warnings)
    values (${importBatchId}, ${sourceName}, ${source.type || "import"}, ${draft.parserVersion || importParserVersion()}, ${actorLabel}, 'committed', ${JSON.stringify({ createdRecipes, createdIngredients, createdSuppliers, createdConversions, skipped })}::jsonb, ${JSON.stringify(warnings)}::jsonb)
  `);

  await sql.transaction((txn) => statements.map((statement) => statement(txn)));
  await audit(sql, "import_batches", importBatchId, "commit", null, { sourceName, createdRecipes, createdIngredients, createdSuppliers, createdConversions, skipped, warnings });
  return { ok: true, importBatchId, createdRecipes, createdIngredients, createdSuppliers, createdConversions, skipped, warnings };
}

export function planBatchDeductions(batches, quantity) {
  let remaining = Number(quantity);
  return batches.flatMap((batch) => {
    if (remaining <= 0) return [];
    const take = Math.min(remaining, Number(batch.quantity_remaining ?? batch.quantityRemaining ?? 0));
    remaining -= take;
    return take > 0 ? [{ batchId: batch.id, quantity: take }] : [];
  });
}

async function batchDeductionsForRequirement(sql, requirement) {
  const batches = await sql`
    select id, quantity_remaining::float as quantity_remaining
    from ingredient_batches
    where ingredient_id = ${requirement.ingredient_id}
      and unit = ${requirement.unit}
      and quantity_remaining > 0
    order by expiry_date nulls last, received_date, created_at
  `;
  return planBatchDeductions(batches, Number(requirement.quantity));
}

async function batchDeductionsForStockRemoval(sql, { ingredientId, unit, quantity }) {
  const batches = await sql`
    select id, quantity_remaining::float as quantity_remaining
    from ingredient_batches
    where ingredient_id = ${ingredientId}
      and unit = ${unit}
      and quantity_remaining > 0
    order by expiry_date nulls last, received_date, created_at
  `;
  return planBatchDeductions(batches, quantity);
}

async function releaseReservation(sql, orderId, actor = null) {
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
  const releaseActor = actorLabel(actor);
  await sql.transaction((txn) => [
    ...pending.flatMap((item, index) => [
      txn`
        insert into inventory_movements (id, ingredient_id, movement_type, quantity_change, unit, related_order_id, note, created_by)
        values (${id(`mov-rel-${index}`)}, ${item.ingredient_id}, 'reservation_release', ${-item.quantity}, ${item.unit}, ${orderId}, 'Released order reservation', ${releaseActor})
      `,
      txn`
        update ingredients
        set reserved_stock = greatest(0, reserved_stock - ${item.quantity}), updated_at = now()
        where id = ${item.ingredient_id}
      `
    ]),
    orderEventStatement(txn, {
      orderId,
      eventType: "reservation_released",
      actor,
      note: "Order reservation released."
    })
  ]);
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
      select name, current_stock::float as current_stock, reserved_stock::float as reserved_stock
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
    const reservedForOrder = Math.max(0, Number(reservationRows[0]?.quantity ?? 0));
    return productionShortageForRequirement(item, rows[0], reservedForOrder);
  })).then((rows) => rows.filter(Boolean));
}

export function productionCompletionPreflight(status) {
  if (status === "Produced") return { produced: false, alreadyProduced: true };
  if (!["Stock Reserved", "In Production"].includes(status)) {
    throw Object.assign(new Error("Start production before marking this order as produced."), { statusCode: 409 });
  }
  return null;
}

// Postgres unique_violation. Completion inserts a production_runs row keyed by
// order_id inside the deduction transaction, so a concurrent or repeat completion
// hits this and rolls the whole transaction back instead of double-deducting.
export function isUniqueViolation(error) {
  return error?.code === "23505" || /duplicate key value|unique constraint/i.test(error?.message ?? "");
}

async function productionQcLogForOrder(sql, orderId, qcInput, actor) {
  const qc = normalizeProductionQcLog(qcInput);
  const lines = await sql`
    select oi.recipe_id, (oi.requested_yield_quantity * oi.quantity_multiplier)::float as expected_yield_quantity,
      oi.yield_unit, r.formula_metadata
    from order_items oi
    join recipes r on r.id = oi.recipe_id
    where oi.order_id = ${orderId}
    order by oi.id
  `;
  const firstLine = lines[0] ?? {};
  const inferredExpectedYield = Number(firstLine.expected_yield_quantity ?? 0) || null;
  const expectedYieldQuantity = qc.expectedYieldQuantity ?? inferredExpectedYield;
  return {
    id: id("qc"),
    orderId,
    recipeId: qc.recipeId || firstLine.recipe_id || null,
    batchKey: qc.batchKey || null,
    formulaVersion: qc.formulaVersion || firstLine.formula_metadata?.formulaVersion || null,
    expectedYieldQuantity,
    actualYieldQuantity: qc.actualYieldQuantity ?? expectedYieldQuantity,
    yieldUnit: qc.yieldUnit || firstLine.yield_unit || null,
    roomTemperature: qc.roomTemperature || null,
    mixTemperature: qc.mixTemperature || null,
    ovenTemperature: qc.ovenTemperature || null,
    bakeTimeMinutes: qc.bakeTimeMinutes ?? null,
    restTimeMinutes: qc.restTimeMinutes ?? null,
    sensoryNotes: qc.sensoryNotes || null,
    defects: qc.defects || null,
    nextAdjustment: qc.nextAdjustment || null,
    passedQc: qc.passedQc !== false,
    loggedBy: actor?.email || actor?.sub || "system"
  };
}

const DEDUCTION_STAGES = ["confirmation", "production_start", "production_completion"];

export function normalizeDeductionStage(value) {
  return DEDUCTION_STAGES.includes(value) ? value : "production_completion";
}

async function orderDeductionStage(sql) {
  const rows = await sql`select default_deduction_stage from settings order by updated_at desc limit 1`;
  return normalizeDeductionStage(rows[0]?.default_deduction_stage);
}

async function allowNegativeInventory(sql) {
  const rows = await sql`select allow_negative_inventory from settings order by updated_at desc limit 1`;
  return rows[0]?.allow_negative_inventory === true;
}

function wasteFromQc(qcLog, qcInput = {}) {
  return num(qcInput.wasteQuantity) > 0
    ? num(qcInput.wasteQuantity)
    : Math.max(0, Number(qcLog?.expectedYieldQuantity ?? 0) - Number(qcLog?.actualYieldQuantity ?? 0));
}

function productionQcInsert(txn, qcLog) {
  return txn`
    insert into production_qc_logs (id, order_id, recipe_id, batch_key, formula_version, expected_yield_quantity, actual_yield_quantity, yield_unit, room_temperature, mix_temperature, oven_temperature, bake_time_minutes, rest_time_minutes, sensory_notes, defects, next_adjustment, passed_qc, logged_by)
    values (${qcLog.id}, ${qcLog.orderId}, ${qcLog.recipeId}, ${qcLog.batchKey}, ${qcLog.formulaVersion}, ${qcLog.expectedYieldQuantity}, ${qcLog.actualYieldQuantity}, ${qcLog.yieldUnit}, ${qcLog.roomTemperature}, ${qcLog.mixTemperature}, ${qcLog.ovenTemperature}, ${qcLog.bakeTimeMinutes}, ${qcLog.restTimeMinutes}, ${qcLog.sensoryNotes}, ${qcLog.defects}, ${qcLog.nextAdjustment}, ${qcLog.passedQc}, ${qcLog.loggedBy})
  `;
}

// Deduct an order's ingredients from stock EXACTLY ONCE by claiming the
// production_runs row (unique order_id) as the first statement of the
// transaction; a concurrent or repeat call fails with 23505 and rolls back with
// no stock change. Reused by every deduction stage.
// - finalize: true also writes the QC log and sets the order Produced in the
//   same transaction (the completion path, unchanged behavior).
// - requireStock: false returns { shortage } instead of throwing, so an early
//   stage never blocks its lifecycle action when stock is not yet available.
// - allowNegative: when short at a required (completion) deduction, proceed as a
//   backorder instead of throwing. Aggregate current_stock may go negative;
//   FEFO lots still stop at zero and the order is flagged Shortage.
async function deductOrderStock(sql, orderId, actor, { stage = "production_completion", finalize = false, qcLog = null, qcInput = {}, requireStock = true, allowNegative = false } = {}) {
  const requirements = await requirementsForOrder(sql, orderId);
  const shortages = await shortagesForProduction(sql, orderId, requirements);
  const isBackorder = shortages.length > 0;
  if (isBackorder && !requireStock) return { deducted: false, shortage: shortages };
  if (isBackorder && !allowNegative) {
    await sql`update orders set stock_status = 'Shortage', updated_at = now() where id = ${orderId}`;
    throw Object.assign(new Error(`Cannot mark produced while ingredients are short: ${shortageSummary(shortages)}.`), { statusCode: 409, details: shortages });
  }
  const batchDeductions = await Promise.all(requirements.map((requirement) => batchDeductionsForRequirement(sql, requirement)));
  const deductActor = actorLabel(actor);
  const stageLabel = `${stage.replace(/_/g, " ")}${isBackorder ? " (backorder)" : ""}`;
  const finalStockStatus = isBackorder ? "Shortage" : "In Stock";
  const orderRows = await sql`select status from orders where id = ${orderId}`;
  const previousStatus = orderRows[0]?.status ?? null;
  try {
    await sql.transaction((txn) => [
      txn`
        insert into production_runs (id, order_id, batch_key, actor, planned_yield, actual_yield, waste_quantity, qc_log_id)
        values (${id("prun")}, ${orderId}, ${qcLog?.batchKey ?? null}, ${deductActor}, ${qcLog?.expectedYieldQuantity ?? null}, ${qcLog?.actualYieldQuantity ?? null}, ${qcLog ? wasteFromQc(qcLog, qcInput) : null}, ${qcLog?.id ?? null})
      `,
      ...requirements.flatMap((requirement, index) => [
        txn`
          insert into inventory_movements (id, ingredient_id, movement_type, quantity_change, unit, related_order_id, note, created_by)
          values (${id(`mov-prod-${index}`)}, ${requirement.ingredient_id}, 'production_use', ${-Number(requirement.quantity)}, ${requirement.unit}, ${orderId}, ${`Deducted at ${stageLabel}`}, ${deductActor})
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
      ...(finalize && qcLog ? [productionQcInsert(txn, qcLog)] : []),
      ...(finalize ? [txn`update orders set status = 'Produced', production_status = 'Completed', stock_status = ${finalStockStatus}, updated_at = now() where id = ${orderId}`] : []),
      orderEventStatement(txn, finalize
        ? { orderId, eventType: "produced", actor, previousStatus, newStatus: "Produced", metadata: { qcLogId: qcLog?.id, passedQc: qcLog?.passedQc, stage, backorder: isBackorder }, note: isBackorder ? "Order marked produced on backorder; aggregate stock is negative." : "Order marked produced; ingredients deducted from stock." }
        : { orderId, eventType: "deducted", actor, previousStatus, newStatus: previousStatus, metadata: { stage, backorder: isBackorder }, note: `Ingredients deducted from stock at ${stageLabel}.` })
    ]);
    return { deducted: true };
  } catch (error) {
    if (isUniqueViolation(error)) return { deducted: false, alreadyDeducted: true };
    throw error;
  }
}

// Deduct at an early lifecycle stage (confirmation / production_start) when the
// deduction-stage setting selects it. Never throws on shortage or double claim:
// the physical deduction is deferred to a later stage the same way completion
// deducts today. Callers pass the current setting to avoid re-querying.
async function maybeDeductAtStage(sql, orderId, actor, stage, currentStage) {
  if (currentStage !== stage) return null;
  return deductOrderStock(sql, orderId, actor, { stage, finalize: false, requireStock: false });
}

export async function produceOrder(sql, orderId, actor, qcInput = {}) {
  await requirePermission(sql, "order.produce", actor);
  await ensureOperationalTables(sql);
  const orderRows = await sql`select status from orders where id = ${orderId}`;
  if (!orderRows.length) throw Object.assign(new Error("Order not found."), { statusCode: 404 });
  const status = orderRows[0].status;
  const preflightResult = productionCompletionPreflight(status);
  if (preflightResult) return preflightResult;

  const qcLog = await productionQcLogForOrder(sql, orderId, qcInput, actor);
  // If stock has NOT already been deducted at an earlier stage, deduct now (the
  // default completion path: deduct + QC + Produced status in one transaction).
  // The pre-check matters because once early deduction has depleted stock, a
  // second shortage recalculation would falsely report a shortage.
  const priorRun = await sql`select id from production_runs where order_id = ${orderId} limit 1`;
  if (!priorRun.length) {
    const allowNegative = await allowNegativeInventory(sql);
    const result = await deductOrderStock(sql, orderId, actor, { stage: "production_completion", finalize: true, qcLog, qcInput, requireStock: true, allowNegative });
    if (result.deducted) {
      await audit(sql, "orders", orderId, "produce", { status }, await rowById(sql, "orders", orderId), actor);
      return { produced: true, qcLogId: qcLog.id };
    }
    // Lost a race to a concurrent claim between the pre-check and here; fall
    // through to finalize (QC + Produced) without deducting again.
  }
  // Stock was already deducted (early stage, or the race above). Complete without
  // deducting. Re-check status so a concurrent completion cannot double-write QC.
  const currentRows = await sql`select status from orders where id = ${orderId}`;
  if (currentRows[0]?.status === "Produced") return { produced: false, alreadyProduced: true };
  await sql.transaction((txn) => [
    productionQcInsert(txn, qcLog),
    txn`update orders set status = 'Produced', production_status = 'Completed', stock_status = 'In Stock', updated_at = now() where id = ${orderId}`,
    orderEventStatement(txn, { orderId, eventType: "produced", actor, previousStatus: status, newStatus: "Produced", metadata: { qcLogId: qcLog.id, passedQc: qcLog.passedQc, deductedEarlier: true }, note: "Order marked produced; stock was deducted at an earlier stage." })
  ]);
  await audit(sql, "orders", orderId, "produce", { status }, await rowById(sql, "orders", orderId), actor);
  return { produced: true, qcLogId: qcLog.id, deductedEarlier: true };
}

export async function handleAction(sql, body, actor) {
  const action = required(body.action, "Action");
  await requirePermission(sql, action, actor);
  await ensureOperationalTables(sql);

  if (action === "schema.ensure") {
    return { ok: true };
  }

  if (action === "import.extract") {
    const context = await loadImportContext(sql);
    return extractImportDraft(body, context);
  }

  if (action === "import.commit") {
    return commitImportDraft(sql, body.draft, actor);
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
    const before = await rowById(sql, archiveTableForEntity(entityType), entityId);
    if (entityType === "ingredient") await sql`update ingredients set active = true, updated_at = now() where id = ${entityId}`;
    else if (entityType === "recipe") {
      const rows = await sql`select product_id from recipes where id = ${entityId}`;
      await sql.transaction((txn) => [
        txn`update recipes set active = true, updated_at = now() where id = ${entityId}`,
        ...(rows[0]?.product_id ? [txn`update products set active = true, updated_at = now() where id = ${rows[0].product_id}`] : [])
      ]);
    } else if (entityType === "order") await sql.transaction((txn) => [
      txn`update orders set archived = false, updated_at = now() where id = ${entityId}`,
      orderEventStatement(txn, {
        orderId: entityId,
        eventType: "restored",
        actor,
        previousStatus: before?.status ?? null,
        newStatus: before?.status ?? null,
        note: "Order restored to the active list."
      })
    ]);
    else if (entityType === "supplier") await sql`update suppliers set active = true, updated_at = now() where id = ${entityId}`;
    else if (entityType === "conversion") await sql`update conversion_rules set active = true, updated_at = now() where id = ${entityId}`;
    await audit(sql, entityType, entityId, "restore", before, { restored: true }, actor);
    return { ok: true, restored: true };
  }

  if (action === "ingredient.save") {
    const data = body.ingredient ?? {};
    const ingredientId = data.id || id("ing");
    const supplierId = data.supplierId || null;
    const baseUnit = normalizeUnit(data.baseUnit);
    const purchaseUnit = normalizeUnit(data.purchaseUnit, baseUnit);
    const name = required(data.name, "Ingredient name");
    const category = required(data.category, "Category");
    const currentStock = nonNegative(num(data.currentStock), "Current stock");
    const reorderLevel = nonNegative(num(data.reorderLevel), "Reorder level");
    const purchaseQuantity = nonNegative(num(data.purchaseQuantity), "Purchase quantity");
    const purchasePrice = nonNegative(num(data.purchasePrice), "Purchase price");
    if (purchasePrice > 0 && purchaseQuantity <= 0) {
      throw Object.assign(new Error("Purchase quantity is required when purchase price is entered."), { statusCode: 400 });
    }
    // PCO-008: count units (pcs/pack/box/roll) are whole-number unless this
    // ingredient explicitly permits partial quantities. Legacy fractional rows
    // are left alone; this only guards new input.
    const allowsDecimals = data.allowsDecimals === undefined || data.allowsDecimals === null || data.allowsDecimals === ""
      ? null
      : bool(data.allowsDecimals);
    const minimumIncrement = num(data.minimumIncrement) > 0 ? num(data.minimumIncrement) : null;
    const divisibility = { allowsDecimals, minimumIncrement };
    for (const [value, label] of [[currentStock, "Current stock"], [reorderLevel, "Reorder level"]]) {
      const incrementError = validateQuantityIncrement(value, baseUnit, label, divisibility);
      if (incrementError) throw Object.assign(new Error(incrementError), { statusCode: 400 });
    }
    if (purchaseQuantity > 0) {
      const purchaseError = validateQuantityIncrement(purchaseQuantity, purchaseUnit, "Purchase quantity", divisibility);
      if (purchaseError) throw Object.assign(new Error(purchaseError), { statusCode: 400 });
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
    const convertedPurchaseQuantity = purchaseQuantity > 0 ? convertPurchaseQuantity(purchaseQuantity, purchaseUnit, baseUnit) : 0;
    const stockAfterPurchase = currentStock + convertedPurchaseQuantity;
    const latestUnitCost = purchasePrice > 0 && convertedPurchaseQuantity > 0 ? purchasePrice / convertedPurchaseQuantity : fallbackUnitCost;
    const defaultExpiryDays = num(data.defaultExpiryDays) || null;
    const expiryDate = data.expiryDate || (bool(data.expiryTrackingEnabled) && defaultExpiryDays
      ? new Date(Date.now() + defaultExpiryDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      : null);
    const allergenProfileJson = JSON.stringify(normalizeIngredientAllergenProfile(data.allergenProfile));
    const storageProfileJson = JSON.stringify(normalizeIngredientStorageProfile(data.storageProfile));

    const purchaseId = id("pur");
    await sql.transaction((txn) => [
      txn`
        insert into ingredients (id, name, category, base_unit, purchase_unit, current_stock, reorder_level, latest_unit_cost, supplier_id, expiry_tracking_enabled, default_expiry_days, expiry_date, notes, allergen_profile, storage_profile, allows_decimals, minimum_increment)
        values (${ingredientId}, ${name}, ${category}, ${baseUnit}, ${purchaseUnit}, ${stockAfterPurchase}, ${reorderLevel}, ${latestUnitCost}, ${supplierId}, ${bool(data.expiryTrackingEnabled)}, ${defaultExpiryDays}, ${expiryDate}, ${data.notes || null}, ${allergenProfileJson}::jsonb, ${storageProfileJson}::jsonb, ${allowsDecimals}, ${minimumIncrement})
        on conflict (id) do update set name = excluded.name, category = excluded.category, base_unit = excluded.base_unit, purchase_unit = excluded.purchase_unit,
          current_stock = excluded.current_stock, reorder_level = excluded.reorder_level, latest_unit_cost = excluded.latest_unit_cost,
          supplier_id = excluded.supplier_id, expiry_tracking_enabled = excluded.expiry_tracking_enabled, default_expiry_days = excluded.default_expiry_days,
          expiry_date = excluded.expiry_date, notes = excluded.notes, allergen_profile = excluded.allergen_profile,
          storage_profile = excluded.storage_profile, allows_decimals = excluded.allows_decimals,
          minimum_increment = excluded.minimum_increment, updated_at = now()
      `,
      ...(purchaseQuantity > 0 ? [
        txn`
          insert into purchase_logs (id, supplier_id, ingredient_id, purchase_quantity, purchase_unit, purchase_price, converted_quantity_in_base_unit, cost_per_base_unit, expiry_date, notes)
          values (${purchaseId}, ${supplierId}, ${ingredientId}, ${purchaseQuantity}, ${purchaseUnit}, ${purchasePrice}, ${convertedPurchaseQuantity}, ${latestUnitCost}, ${expiryDate}, 'Initial purchase from ingredient form')
        `,
        txn`
          insert into inventory_movements (id, ingredient_id, movement_type, quantity_change, unit, note, created_by)
          values (${id("mov")}, ${ingredientId}, 'purchase', ${convertedPurchaseQuantity}, ${baseUnit}, 'Added stock from ingredient form purchase', 'system')
        `,
        createBatchFromPurchase(txn, { purchaseId, ingredientId, quantity: convertedPurchaseQuantity, unit: baseUnit, expiryDate, note: "Initial purchase from ingredient form" })
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
    const ingredientRows = await sql`
      select current_stock::float as current_stock, base_unit, allows_decimals, minimum_increment::float as minimum_increment
      from ingredients where id = ${ingredientId}
    `;
    if (ingredientRows.length) {
      const incrementError = validateQuantityIncrement(Math.abs(quantity), ingredientRows[0].base_unit, "Adjustment quantity", {
        allowsDecimals: ingredientRows[0].allows_decimals,
        minimumIncrement: ingredientRows[0].minimum_increment
      });
      if (incrementError) throw Object.assign(new Error(incrementError), { statusCode: 400 });
    }
    const before = await rowById(sql, "ingredients", ingredientId);
    if (!ingredientRows.length) throw Object.assign(new Error("Ingredient not found."), { statusCode: 404 });
    if (Number(ingredientRows[0].current_stock) + quantity < 0) {
      throw Object.assign(new Error("Adjustment would make stock negative."), { statusCode: 400 });
    }
    const unit = required(body.unit, "Unit");
    const batchDeductions = quantity < 0
      ? await batchDeductionsForStockRemoval(sql, { ingredientId, unit, quantity: Math.abs(quantity) })
      : [];
    await sql.transaction((txn) => {
      const statements = [
        txn`
        insert into inventory_movements (id, ingredient_id, movement_type, quantity_change, unit, note, created_by)
        values (${id("mov")}, ${ingredientId}, ${movementType}, ${quantity}, ${unit}, ${body.note || "Manual stock adjustment"}, 'system')
      `,
        txn`update ingredients set current_stock = current_stock + ${quantity}, updated_at = now() where id = ${ingredientId}`,
        ...batchDeductions.map((deduction) => txn`
          update ingredient_batches
          set quantity_remaining = greatest(0, quantity_remaining - ${deduction.quantity}), updated_at = now()
          where id = ${deduction.batchId}
        `)
      ];
      if (movementType === "purchase" && quantity > 0) {
        statements.push(txn`
        insert into ingredient_batches (id, ingredient_id, quantity_received, quantity_remaining, unit, expiry_date, received_date, notes)
        values (${id("lot")}, ${ingredientId}, ${quantity}, ${quantity}, ${unit}, ${body.expiryDate || null}, now(), ${body.note || "Manual stock purchase"})
      `);
      }
      return statements;
    });
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
    await sql`alter table recipes add column if not exists formula_metadata jsonb not null default '{}'`;
    await sql`alter table recipe_items add column if not exists prep_state jsonb not null default '{}'`;
    const data = body.recipe ?? {};
    const productId = data.productId || id("prod");
    const recipeId = data.id || id("rec");
    const before = data.id ? await rowById(sql, "recipes", data.id) : null;
    const baseYieldError = validatePositiveNumber(data.baseYieldQuantity, "Base yield");
    if (baseYieldError) throw Object.assign(new Error(baseYieldError), { statusCode: 400 });
    const rawItems = Array.isArray(data.items) ? data.items.filter((item) => item.ingredientId) : [];
    for (const item of rawItems) {
      const quantityError = validatePositiveNumber(item.quantity, "Ingredient quantity");
      if (quantityError) throw Object.assign(new Error(quantityError), { statusCode: 400 });
    }
    const items = rawItems;
    if (!items.length) throw Object.assign(new Error("Add at least one recipe ingredient."), { statusCode: 400 });
    const instructions = String(data.instructions || "").split(/\n+/).map((step) => step.trim()).filter(Boolean);
    const formulaMetadata = normalizeRecipeFormulaMetadata(data.formulaMetadata);
    const formulaMetadataJson = JSON.stringify(formulaMetadata);
    const costProfileJson = JSON.stringify(normalizeRecipeCostProfile(data.costProfile));
    await sql.transaction((txn) => [
      txn`
        insert into products (id, name, category, description, active)
        values (${productId}, ${required(data.name, "Product name")}, ${required(data.category, "Category")}, ${data.notes || null}, true)
        on conflict (id) do update set name = excluded.name, category = excluded.category, description = excluded.description, updated_at = now()
      `,
      txn`
        insert into recipes (id, product_id, name, category, base_yield_quantity, yield_unit, instructions, notes, formula_metadata, cost_profile, active)
        values (${recipeId}, ${productId}, ${required(data.name, "Recipe name")}, ${required(data.category, "Category")}, ${num(data.baseYieldQuantity, 1)}, ${data.yieldUnit || "pieces"}, ${instructions}, ${data.notes || null}, ${formulaMetadataJson}::jsonb, ${costProfileJson}::jsonb, true)
        on conflict (id) do update set name = excluded.name, category = excluded.category, base_yield_quantity = excluded.base_yield_quantity,
          yield_unit = excluded.yield_unit, instructions = excluded.instructions, notes = excluded.notes, formula_metadata = excluded.formula_metadata,
          cost_profile = excluded.cost_profile, updated_at = now()
      `,
      txn`delete from recipe_items where recipe_id = ${recipeId}`,
      ...items.map((item, index) => {
        const prepStateJson = JSON.stringify(normalizeRecipeItemPrepState(item.prepState));
        return txn`
        insert into recipe_items (id, recipe_id, ingredient_id, quantity, unit, waste_percentage, notes, prep_state)
        values (${id(`ri-${index}`)}, ${recipeId}, ${item.ingredientId}, ${num(item.quantity)}, ${normalizeUnit(item.unit)}, ${num(item.wastePercentage)}, ${item.notes || null}, ${prepStateJson}::jsonb)
      `;
      })
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
    const pricing = computeOrderPricing({
      lines: items.map((item) => ({
        saleQuantity: item.saleQuantity === undefined || item.saleQuantity === null || item.saleQuantity === ""
          ? num(item.requestedYieldQuantity, 1) * num(item.quantityMultiplier, 1)
          : num(item.saleQuantity),
        unitSellingPrice: num(item.unitSellingPrice)
      })),
      deliveryFee: num(data.deliveryFee),
      discountAmount: num(data.discountAmount),
      taxRate: num(data.taxRate),
      amountPaid: num(data.amountPaid)
    });
    const priced = pricing.hasPricing;
    await sql.transaction((txn) => [
      txn`
        insert into orders (id, customer_name, customer_phone, due_date, delivery_method, status, payment_status, production_status, stock_status, notes, archived,
          delivery_fee, discount_amount, tax_rate, amount_paid, subtotal, tax_amount, net_total, gross_total, balance)
        values (${orderId}, ${required(data.customerName, "Customer name")}, ${data.customerPhone || null}, ${required(data.dueDate, "Due date")}, ${data.deliveryMethod || "Pickup"}, ${data.status || "Confirmed"}, ${data.paymentStatus || "Unpaid"}, 'Not Started', 'In Stock', ${data.notes || null}, false,
          ${priced ? pricing.deliveryFee : null}, ${priced ? pricing.discountAmount : null}, ${priced ? pricing.taxRate : null}, ${priced ? pricing.amountPaid : null}, ${priced ? pricing.subtotal : null}, ${priced ? pricing.taxAmount : null}, ${priced ? pricing.netTotal : null}, ${priced ? pricing.grossTotal : null}, ${priced ? pricing.balance : null})
        on conflict (id) do update set customer_name = excluded.customer_name, customer_phone = excluded.customer_phone, due_date = excluded.due_date,
          delivery_method = excluded.delivery_method, status = excluded.status, payment_status = excluded.payment_status, notes = excluded.notes, archived = false,
          delivery_fee = excluded.delivery_fee, discount_amount = excluded.discount_amount, tax_rate = excluded.tax_rate, amount_paid = excluded.amount_paid,
          subtotal = excluded.subtotal, tax_amount = excluded.tax_amount, net_total = excluded.net_total, gross_total = excluded.gross_total, balance = excluded.balance, updated_at = now()
      `,
      txn`delete from order_items where order_id = ${orderId}`,
      ...items.map((item, index) => txn`
        insert into order_items (id, order_id, product_id, recipe_id, requested_yield_quantity, yield_unit, quantity_multiplier, notes, sale_quantity, unit_selling_price)
        values (${id(`oi-${index}`)}, ${orderId}, ${item.productId}, ${item.recipeId}, ${num(item.requestedYieldQuantity, 1)}, ${item.yieldUnit || "pieces"}, ${num(item.quantityMultiplier, 1)}, ${item.notes || null}, ${pricing.lines[index].saleQuantity}, ${priced ? pricing.lines[index].unitSellingPrice : null})
      `),
      orderEventStatement(txn, {
        orderId,
        eventType: data.id ? "updated" : "created",
        actor,
        previousStatus: before?.status ?? null,
        newStatus: data.status || "Confirmed",
        note: data.id ? "Order details updated." : "Order created."
      })
    ]);
    const stockStatus = await stockStatusForRequirements(sql, await requirementsForOrder(sql, orderId));
    await sql`update orders set stock_status = ${stockStatus}, updated_at = now() where id = ${orderId}`;
    const reservation = body.reserve ? await reserveOrder(sql, orderId, actor) : null;
    if (body.reserve) await maybeDeductAtStage(sql, orderId, actor, "confirmation", await orderDeductionStage(sql));
    await audit(sql, "orders", orderId, data.id ? "update" : "create", before, await rowById(sql, "orders", orderId), actor);
    return { ok: true, id: orderId, stockStatus, reservation };
  }

  if (action === "order.reserve") {
    const orderId = required(body.orderId, "Order");
    const reservation = await reserveOrder(sql, orderId, actor);
    await maybeDeductAtStage(sql, orderId, actor, "confirmation", await orderDeductionStage(sql));
    return reservation;
  }
  if (action === "order.releaseReservation") return releaseReservation(sql, required(body.orderId, "Order"), actor);
  if (action === "order.produce") return produceOrder(sql, required(body.orderId, "Order"), actor, body.qcLog ?? {});

  if (action === "order.delete") {
    await sql`alter table orders add column if not exists archived boolean not null default false`;
    const orderId = required(body.orderId, "Order");
    const before = await rowById(sql, "orders", orderId);
    await releaseReservation(sql, orderId, actor);
    await sql.transaction((txn) => [
      txn`
        update orders
        set archived = true, status = 'Cancelled', stock_status = 'In Stock', updated_at = now()
        where id = ${orderId}
      `,
      orderEventStatement(txn, {
        orderId,
        eventType: "cancelled",
        actor,
        previousStatus: before?.status ?? null,
        newStatus: "Cancelled",
        note: "Order deleted from the active list; reservation released."
      })
    ]);
    await audit(sql, "orders", orderId, "archive", before, await rowById(sql, "orders", orderId), actor);
    return { ok: true, archived: true };
  }

  if (action === "order.status") {
    const orderId = required(body.orderId, "Order");
    const status = required(body.status, "Status");
    const before = await rowById(sql, "orders", orderId);
    if (before && !isValidOrderTransition(before.status, status)) {
      throw Object.assign(new Error(`Cannot change an order from ${before.status} to ${status}.`), { statusCode: 409 });
    }
    const cancellationReason = status === "Cancelled" ? required(body.reason, "Cancellation reason") : null;
    const productionStatus = body.productionStatus || (status === "In Production" ? "In Progress" : status === "Delivered" || status === "Produced" ? "Completed" : undefined);
    if (status === "In Production") {
      const reservation = await reserveOrder(sql, orderId, actor);
      if (reservation.shortage && !(await allowNegativeInventory(sql))) {
        throw Object.assign(new Error(`Cannot start production until shortages are resolved: ${shortageSummary(reservation.shortages)}.`), { statusCode: 409, details: reservation.shortages });
      }
    }
    if (status === "Produced") return produceOrder(sql, orderId, actor, body.qcLog ?? {});
    if (status === "Delivered") {
      const rows = await sql`select status, stock_status from orders where id = ${orderId}`;
      if (rows[0]?.status !== "Produced") {
        throw Object.assign(new Error("Mark the order as produced before delivery."), { statusCode: 409 });
      }
      if (rows[0]?.stock_status === "Shortage") {
        throw Object.assign(new Error("Resolve ingredient shortages before delivery."), { statusCode: 409 });
      }
    }
    const statusEventType = status === "Delivered" ? "delivered" : status === "Cancelled" ? "cancelled" : status === "In Production" ? "production_started" : "status_changed";
    await sql.transaction((txn) => [
      txn`
        update orders
        set status = ${status}, production_status = coalesce(${productionStatus || null}, production_status), updated_at = now()
        where id = ${orderId}
      `,
      orderEventStatement(txn, {
        orderId,
        eventType: statusEventType,
        actor,
        previousStatus: before?.status ?? null,
        newStatus: status,
        metadata: cancellationReason ? { reason: cancellationReason } : {},
        note: cancellationReason ? `Order cancelled: ${cancellationReason}` : `Status changed to ${status}.`
      })
    ]);
    if (status === "In Production") await maybeDeductAtStage(sql, orderId, actor, "production_start", await orderDeductionStage(sql));
    if (status === "Cancelled") await releaseReservation(sql, orderId, actor);
    await audit(sql, "orders", orderId, "status_change", before, await rowById(sql, "orders", orderId), actor);
    return { ok: true };
  }

  if (action === "production.batchStatus") {
    const orderIds = Array.isArray(body.orderIds) ? body.orderIds.map(String) : [];
    if (!orderIds.length) throw Object.assign(new Error("Select at least one order for this production batch."), { statusCode: 400 });
    const status = required(body.status, "Status");
    const productionStatus = body.productionStatus || (status === "In Production" ? "In Progress" : status === "Produced" ? "Completed" : "Ready");
    const batchAllowNegative = await allowNegativeInventory(sql);
    if (status === "Produced") {
      const results = [];
      for (const orderId of orderIds) {
        const reservation = await reserveOrder(sql, orderId, actor);
        if (reservation.shortage && !batchAllowNegative) {
          throw Object.assign(new Error(`Cannot complete this batch until shortages are resolved: ${shortageSummary(reservation.shortages)}.`), { statusCode: 409, details: reservation.shortages });
        }
        await sql`
          update orders
          set status = 'In Production', production_status = 'In Progress', updated_at = now()
          where id = ${orderId} and status not in ('Produced', 'Delivered', 'Cancelled')
        `;
        results.push(await produceOrder(sql, orderId, actor, body.qcLog ?? {}));
      }
      return { ok: true, count: results.length, results };
    }
    if (status === "In Production") {
      for (const orderId of orderIds) {
        const reservation = await reserveOrder(sql, orderId, actor);
        if (reservation.shortage && !batchAllowNegative) {
          throw Object.assign(new Error(`Cannot start this batch until shortages are resolved: ${shortageSummary(reservation.shortages)}.`), { statusCode: 409, details: reservation.shortages });
        }
      }
    }
    const batchEventType = status === "In Production" ? "production_started" : "status_changed";
    await sql.transaction((txn) => orderIds.flatMap((orderId) => [
      txn`
        update orders
        set status = ${status}, production_status = ${productionStatus}, updated_at = now()
        where id = ${orderId} and status not in ('Produced', 'Delivered', 'Cancelled')
      `,
      orderEventStatement(txn, {
        orderId,
        eventType: batchEventType,
        actor,
        newStatus: status,
        metadata: { batch: true },
        note: `Batch status changed to ${status}.`
      })
    ]));
    return { ok: true, count: orderIds.length };
  }

  if (action === "shopping.purchaseSuggested") {
    const purchases = Array.isArray(body.items) ? body.items : [];
    if (!purchases.length) throw Object.assign(new Error("No shopping list items to purchase."), { statusCode: 400 });
    const normalizedPurchases = await Promise.all(purchases.map(async (item, index) => {
      const ingredientId = required(item?.ingredientId, "Ingredient");
      const ingredientRows = await sql`select supplier_id, base_unit from ingredients where id = ${ingredientId}`;
      return normalizeShoppingPurchaseInput(item, ingredientRows[0], index);
    }));
    try {
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
              latest_unit_cost = ${item.unitCost},
              updated_at = now()
            where id = ${item.ingredientId}
          `,
          createBatchFromPurchase(txn, item)
        ];
      }));
    } catch (error) {
      throw safePurchasePersistenceError(error);
    }
    await Promise.all(normalizedPurchases.map((item) => audit(sql, "ingredients", item.ingredientId, "purchase", null, { purchaseId: item.purchaseId, quantity: item.quantity, unit: item.unit, expiryDate: item.expiryDate })));
    return { ok: true, count: normalizedPurchases.length };
  }

  if (action === "conversion.save") {
    const data = body.rule ?? {};
    const ruleId = data.id || id("conv");
    const before = data.id ? await rowById(sql, "conversion_rules", data.id) : null;
    const scope = normalizeConversionScope(data);
    await sql`
      insert into conversion_rules (id, ingredient_id, from_unit, to_unit, conversion_factor, conversion_type, confidence_level, source, verified, notes, ingredient_state, temperature_state, formula_context)
      values (${ruleId}, ${required(data.ingredientId, "Ingredient")}, ${required(data.fromUnit, "From unit")}, ${required(data.toUnit, "To unit")}, ${num(data.conversionFactor, 1)}, ${data.conversionType || "ingredient_specific"}, ${data.confidenceLevel || "Medium"}, ${data.source || "manual entry"}, ${bool(data.verified)}, ${data.notes || null}, ${scope.ingredientState || null}, ${scope.temperatureState || null}, ${scope.formulaContext || null})
      on conflict (id) do update set ingredient_id = excluded.ingredient_id, from_unit = excluded.from_unit, to_unit = excluded.to_unit,
        conversion_factor = excluded.conversion_factor, conversion_type = excluded.conversion_type, confidence_level = excluded.confidence_level,
        source = excluded.source, verified = excluded.verified, notes = excluded.notes, ingredient_state = excluded.ingredient_state,
        temperature_state = excluded.temperature_state, formula_context = excluded.formula_context, updated_at = now()
    `;
    await audit(sql, "conversion_rules", ruleId, data.id ? "update" : "create", before, await rowById(sql, "conversion_rules", ruleId));
    return { ok: true, id: ruleId };
  }

  if (action === "conversion.verify") {
    const ruleId = required(body.ruleId, "Rule");
    const before = await rowById(sql, "conversion_rules", ruleId);
    await sql`update conversion_rules set verified = true, source = 'measured in kitchen', updated_at = now() where id = ${ruleId}`;
    await audit(sql, "conversion_rules", ruleId, "verify", before, await rowById(sql, "conversion_rules", ruleId), actor);
    return { ok: true };
  }

  // Apply a reviewed conversion to ONE named recipe ingredient line. This is the
  // only path that changes a recipe from a conversion; it is separate from saving
  // a reusable rule, refuses stale writes, and keeps the line's import/source
  // evidence intact while recording who applied what and from which rule.
  if (action === "conversion.applyToRecipeItem") {
    const recipeItemId = required(body.recipeItemId, "Recipe ingredient");
    const finalUnit = normalizeUnit(required(body.finalUnit, "Converted unit"));
    if (!RECIPE_ITEM_UNITS.includes(finalUnit)) {
      throw Object.assign(new Error(`${finalUnit} cannot be used on a recipe ingredient.`), { statusCode: 400 });
    }
    const finalQuantity = num(body.finalQuantity);
    const quantityError = validatePositiveNumber(finalQuantity, "Converted quantity");
    if (quantityError) throw Object.assign(new Error(quantityError), { statusCode: 400 });
    const rows = await sql`
      select id, recipe_id, quantity::float as quantity, unit, coalesce(prep_state, '{}'::jsonb) as prep_state
      from recipe_items
      where id = ${recipeItemId}
    `;
    const conflict = conversionApplyConflict(rows[0], { quantity: num(body.expectedQuantity), unit: String(body.expectedUnit ?? "") });
    if (conflict) throw Object.assign(new Error(conflict), { statusCode: rows.length ? 409 : 404 });
    const current = rows[0];
    const prepState = normalizeRecipeItemPrepState({
      ...(current.prep_state ?? {}),
      convertedFromQuantity: Number(current.quantity),
      convertedFromUnit: current.unit,
      conversionRuleId: body.conversionRuleId || undefined,
      conversionAppliedBy: actorLabel(actor),
      conversionAppliedAt: new Date().toISOString()
    });
    await sql`
      update recipe_items
      set quantity = ${finalQuantity}, unit = ${finalUnit}, prep_state = ${JSON.stringify(prepState)}::jsonb, updated_at = now()
      where id = ${recipeItemId}
    `;
    await audit(sql, "recipe_items", recipeItemId, "conversion_apply",
      { quantity: current.quantity, unit: current.unit },
      { quantity: finalQuantity, unit: finalUnit, conversionRuleId: body.conversionRuleId ?? null }, actor);
    return { ok: true, recipeId: current.recipe_id, quantity: finalQuantity, unit: finalUnit };
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
    const linked = await sql`select name from ingredients where supplier_id = ${supplierId} and active = true order by name limit 5`;
    if (linked.length) {
      throw Object.assign(new Error(`Cannot delete supplier while linked to ingredients: ${linked.map((item) => item.name).join(", ")}. Reassign those ingredients first.`), { statusCode: 409 });
    }
    await sql.transaction((txn) => [
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
      values ('default', ${data.businessName || "Pastry County"}, ${data.currency || "NGN"}, ${normalizeDeductionStage(data.defaultDeductionStage)}, ${bool(data.allowNegativeInventory)}, ${true}, ${num(data.gramRoundingPreference, 5)}, ${data.eggRoundingPreference || "nearest_whole_egg"}, ${nonNegative(num(data.safetyMarginPercentage, 10), "Safety margin")}, ${nonNegative(num(data.defaultTaxPercentage, 0), "Tax percentage")}, ${data.lowStockNotificationEmail || null})
      on conflict (id) do update set business_name = excluded.business_name, currency = excluded.currency, default_deduction_stage = excluded.default_deduction_stage,
        allow_negative_inventory = excluded.allow_negative_inventory, require_ai_conversion_confirmation = excluded.require_ai_conversion_confirmation,
        gram_rounding_preference = excluded.gram_rounding_preference, egg_rounding_preference = excluded.egg_rounding_preference,
        safety_margin_percentage = excluded.safety_margin_percentage, default_tax_percentage = excluded.default_tax_percentage,
        low_stock_notification_email = excluded.low_stock_notification_email, updated_at = now()
    `;
    await audit(sql, "settings", "default", "update", before, await rowById(sql, "settings", "default"));
    return { ok: true };
  }

  if (action === "user.save") {
    const data = body.user ?? {};
    const userId = data.id || id("user");
    const before = data.id ? await rowById(sql, "app_users", data.id) : null;
    const password = String(data.password || "").trim();
    const passwordHash = password ? bcrypt.hashSync(password, 10) : before?.password_hash;
    if (!passwordHash) throw Object.assign(new Error("Temporary password is required for new staff users."), { statusCode: 400 });
    await sql`
      insert into app_users (id, email, full_name, role, password_hash, active)
      values (${userId}, ${required(data.email, "Email")}, ${required(data.fullName, "Full name")}, ${required(data.role, "Role")}, ${passwordHash}, ${data.active !== false})
      on conflict (id) do update set email = excluded.email, full_name = excluded.full_name, role = excluded.role,
        password_hash = excluded.password_hash, active = excluded.active, updated_at = now()
    `;
    await audit(sql, "app_users", userId, data.id ? "update" : "create", before, await rowById(sql, "app_users", userId));
    return { ok: true, id: userId };
  }

  if (action === "user.disable") {
    const userId = required(body.userId, "User");
    const before = await rowById(sql, "app_users", userId);
    await sql`update app_users set active = false, session_revoked_at = now(), updated_at = now() where id = ${userId}`;
    // session_revoked_at is the security boundary (it is checked on every request);
    // marking the rows too keeps the stored session list honest.
    await revokeAllUserSessions(sql, userId, "user-disabled");
    await audit(sql, "app_users", userId, "disable", before, await rowById(sql, "app_users", userId), actor);
    return { ok: true };
  }

  if (action === "user.revokeSessions") {
    const userId = required(body.userId, "User");
    const before = await rowById(sql, "app_users", userId);
    await sql`update app_users set session_revoked_at = now(), updated_at = now() where id = ${userId}`;
    const revokedCount = await revokeAllUserSessions(sql, userId, "staff-revoked");
    await audit(sql, "app_users", userId, "revoke_sessions", before, await rowById(sql, "app_users", userId), actor);
    return { ok: true, revokedSessions: revokedCount };
  }

  if (action === "notification.lowStockEmail") {
    const rows = await sql`select low_stock_notification_email from settings order by updated_at desc limit 1`;
    const recipient = rows[0]?.low_stock_notification_email || null;
    const items = Array.isArray(body.items) ? body.items.map(String) : [];
    const subject = `Low stock alert: ${items.length} item${items.length === 1 ? "" : "s"} need attention`;
    const message = items.join("\n") || "No low-stock items were supplied.";
    const delivery = await sendResendEmail({ to: recipient, subject, text: message });
    await sql`
      insert into notification_events (id, type, recipient, subject, body, status, created_by)
      values (${id("notify")}, 'low_stock_email', ${recipient}, ${subject}, ${message}, ${delivery.status}, ${actor?.email || "system"})
    `;
    await audit(sql, "notifications", "low_stock_email", "log", null, { recipient, subject, itemCount: items.length, status: delivery.status, providerId: delivery.providerId, error: delivery.error });
    return { ok: true, recipient, status: delivery.status, providerId: delivery.providerId, error: delivery.error };
  }

  throw Object.assign(new Error(`Unknown action: ${action}`), { statusCode: 400 });
}
