import { conversionRules, ingredients, inventoryMovements, orderItems, orders, products, recipeItems, recipes, settings, suppliers } from "../data";
import type { ConversionRule, Ingredient, Order, OrderEvent, OrderItem, Product, Recipe, RecipeItem, RecipeItemPrepState, Settings, Unit } from "../types";

export interface ScaledIngredient {
  ingredientId: string;
  ingredientName: string;
  originalQuantity: number;
  scaledQuantity: number;
  unit: Unit;
  scaleFactor: number;
  formulaContext?: string;
  displayQuantity?: number;
  displayUnit?: Unit;
  scalingNote?: string;
  prepState?: RecipeItemPrepState;
}

export interface ScalingPreferences {
  eggRoundingPreference?: Settings["eggRoundingPreference"];
}

export interface ConversionScope {
  ingredientState?: string;
  temperatureState?: string;
  formulaContext?: string;
}

export interface StockAvailability {
  ingredientId: string;
  ingredientName: string;
  requiredQuantity: number;
  currentStock: number;
  reservedStock: number;
  availableStock: number;
  shortageQuantity: number;
  status: "enough_stock" | "low_stock_after_use" | "shortage" | "out_of_stock";
}

export function formatNaira(value: number) {
  const safeValue = Number.isFinite(value) ? value : 0;
  const decimals = Number.isInteger(safeValue) ? 0 : 2;
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: settings.currency ?? "NGN",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(safeValue);
}

export function formatQuantity(value: number, unit: Unit) {
  const countUnits: Unit[] = ["pcs", "pack", "roll", "egg", "yolk", "white"];
  const normalized = countUnits.includes(unit) ? (value < 0 ? Math.floor(value) : Math.ceil(value)) : Number(value.toFixed(3));
  return `${normalized.toLocaleString("en-NG")}${unit}`;
}

export function stockAdjustmentValidation({
  direction,
  quantity,
  currentStock,
  unit,
  removalConfirmed = false
}: {
  direction: "add" | "remove";
  quantity: number;
  currentStock: number;
  unit: Unit;
  removalConfirmed?: boolean;
}) {
  if (!Number.isFinite(quantity) || quantity <= 0) return "Enter an adjustment quantity greater than zero.";
  if (direction === "remove" && quantity > currentStock) return `Cannot remove more than available stock (${formatQuantity(currentStock, unit)}).`;
  if (direction === "remove" && !removalConfirmed) return "Confirm this stock removal before saving.";
  return "";
}

export function roundByPreference(value: number, unit: Unit) {
  if (unit === "g") return Math.round(value / settings.gramRoundingPreference) * settings.gramRoundingPreference;
  if (unit === "ml") return Math.round(value / 5) * 5;
  if (["pcs", "pack", "roll"].includes(unit)) return Math.ceil(value);
  return Number(value.toFixed(2));
}

const eggGramFactors: Record<"egg" | "yolk" | "white", number> = {
  egg: 50,
  yolk: 18,
  white: 30
};

function activeEggPreference(preferences: ScalingPreferences = {}) {
  return preferences.eggRoundingPreference ?? settings.eggRoundingPreference ?? "nearest_whole_egg";
}

function eggScalingUnit(unit: Unit, ingredient?: Pick<Ingredient, "id" | "name">): "egg" | "yolk" | "white" | undefined {
  if (unit === "egg" || unit === "yolk" || unit === "white") return unit;
  if (unit !== "pcs" || !ingredient) return undefined;
  const label = `${ingredient.id} ${ingredient.name}`.toLowerCase();
  if (/\byolks?\b/.test(label)) return "yolk";
  if (/\bwhites?\b/.test(label)) return "white";
  if (/\beggs?\b/.test(label)) return "egg";
  return undefined;
}

function scaledEggDisplay(scaledQuantity: number, eggUnit: "egg" | "yolk" | "white") {
  return {
    displayQuantity: Number((scaledQuantity * eggGramFactors[eggUnit]).toFixed(1)),
    displayUnit: "g" as Unit,
    scalingNote: `${eggUnit === "egg" ? "whole egg" : eggUnit} converted at ${eggGramFactors[eggUnit]}g each`
  };
}

export function roundScaledQuantity(value: number, unit: Unit, preferences: ScalingPreferences = {}, ingredient?: Pick<Ingredient, "id" | "name">) {
  const eggUnit = eggScalingUnit(unit, ingredient);
  if (eggUnit) {
    if (activeEggPreference(preferences) === "allow_gram_conversion") return Number(value.toFixed(3));
    return value <= 0 ? 0 : Math.max(1, Math.round(value));
  }
  if (["pcs", "pack", "roll"].includes(unit)) return Math.ceil(value);
  if (["g", "kg", "ml", "litre", "cup", "tablespoon", "teaspoon"].includes(unit)) return Number(value.toFixed(1));
  return Number(value.toFixed(2));
}

export function formatScaledIngredientQuantity(item: Pick<ScaledIngredient, "scaledQuantity" | "unit" | "displayQuantity" | "displayUnit">) {
  return formatQuantity(item.displayQuantity ?? item.scaledQuantity, item.displayUnit ?? item.unit);
}

const orderEventLabels: Record<string, string> = {
  created: "Order created",
  updated: "Order details updated",
  reserved: "Stock reserved",
  reservation_released: "Reservation released",
  production_started: "Production started",
  produced: "Marked produced",
  delivered: "Delivered",
  cancelled: "Order cancelled",
  restored: "Order restored"
};

export function orderEventLabel(event: Pick<OrderEvent, "eventType" | "newStatus">): string {
  return orderEventLabels[event.eventType]
    ?? (event.newStatus ? `Status changed to ${event.newStatus}` : "Order updated");
}

export function orderEventsForOrder(events: OrderEvent[], orderId: string): OrderEvent[] {
  return events
    .filter((event) => event.orderId === orderId)
    .slice()
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export function scaleRecipe(recipeId: string, requestedYieldQuantity: number, recipeList = recipes, itemList = recipeItems, ingredientList = ingredients, preferences: ScalingPreferences = settings): ScaledIngredient[] {
  const recipe = recipeList.find((item) => item.id === recipeId);
  if (!recipe) throw new Error(`Recipe ${recipeId} was not found`);
  const scaleFactor = requestedYieldQuantity / recipe.baseYieldQuantity;
  const formulaContext = recipe.formulaMetadata?.productFamily || recipe.category;
  return itemList
    .filter((item) => item.recipeId === recipeId)
    .map((item) => {
      const ingredient = ingredientList.find((candidate) => candidate.id === item.ingredientId);
      if (!ingredient) throw new Error(`Ingredient ${item.ingredientId} was not found`);
      const withWaste = item.quantity * (1 + (item.wastePercentage ?? 0) / 100);
      const scaledQuantity = roundScaledQuantity(withWaste * scaleFactor, item.unit, preferences, ingredient);
      const eggUnit = eggScalingUnit(item.unit, ingredient);
      const display = eggUnit && activeEggPreference(preferences) === "allow_gram_conversion"
        ? scaledEggDisplay(scaledQuantity, eggUnit)
        : {};
      return {
        ingredientId: ingredient.id,
        ingredientName: ingredient.name,
        originalQuantity: item.quantity,
        scaledQuantity,
        unit: item.unit,
        scaleFactor,
        formulaContext,
        prepState: item.prepState,
        ...display
      };
    });
}

export function combineRequirements(requirements: ScaledIngredient[]) {
  const map = new Map<string, ScaledIngredient>();
  requirements.forEach((item) => {
    const key = [
      item.ingredientId,
      item.unit,
      item.prepState?.ingredientState ?? "",
      item.prepState?.temperatureState ?? "",
      item.formulaContext ?? ""
    ].join(":");
    const existing = map.get(key);
    if (existing) {
      existing.scaledQuantity += item.scaledQuantity;
      if (existing.displayUnit && existing.displayUnit === item.displayUnit && item.displayQuantity !== undefined) {
        existing.displayQuantity = (existing.displayQuantity ?? 0) + item.displayQuantity;
      }
    }
    else map.set(key, { ...item });
  });
  return Array.from(map.values());
}

export function checkStockAvailability(scaledIngredients: ScaledIngredient[], ingredientList = ingredients): StockAvailability[] {
  return scaledIngredients.map((rawItem) => {
    const item = normalizeRequirementToBase(rawItem);
    const ingredient = ingredientList.find((candidate) => candidate.id === item.ingredientId);
    if (!ingredient) throw new Error(`Ingredient ${item.ingredientId} was not found`);
    const reservedStock = ingredient.reservedStock ?? 0;
    const availableStock = ingredient.currentStock - reservedStock;
    const shortageQuantity = Math.max(0, item.scaledQuantity - availableStock);
    const remaining = availableStock - item.scaledQuantity;
    const status =
      ingredient.currentStock <= 0
        ? "out_of_stock"
        : shortageQuantity > 0
          ? "shortage"
          : remaining <= ingredient.reorderLevel
            ? "low_stock_after_use"
            : "enough_stock";
    return {
      ingredientId: item.ingredientId,
      ingredientName: item.ingredientName,
      requiredQuantity: item.scaledQuantity,
      currentStock: ingredient.currentStock,
      reservedStock,
      availableStock,
      shortageQuantity,
      status
    };
  });
}

export function requirementsForOrderLines(lines: Pick<OrderItem, "recipeId" | "requestedYieldQuantity" | "quantityMultiplier">[]) {
  return combineRequirements(lines.flatMap((line) => scaleRecipe(line.recipeId, line.requestedYieldQuantity * line.quantityMultiplier)));
}

export function reservationQuantityForOrder(orderId: string, ingredientId: string, unit: Unit) {
  return inventoryMovements
    .filter((movement) => movement.relatedOrderId === orderId && movement.ingredientId === ingredientId && movement.unit === unit && ["reservation", "reservation_release"].includes(movement.movementType))
    .reduce((sum, movement) => sum + movement.quantityChange, 0);
}

export function checkOrderStockAvailability(orderId: string, ingredientList = ingredients): StockAvailability[] {
  return requirementsForOrder(orderId).map((item) => {
    const ingredient = ingredientList.find((candidate) => candidate.id === item.ingredientId);
    if (!ingredient) throw new Error(`Ingredient ${item.ingredientId} was not found`);
    const reservedStock = ingredient.reservedStock ?? 0;
    const reservedForThisOrder = Math.max(0, reservationQuantityForOrder(orderId, item.ingredientId, item.unit));
    const availableStock = ingredient.currentStock - Math.max(0, reservedStock - reservedForThisOrder);
    const shortageQuantity = Math.max(0, item.scaledQuantity - availableStock);
    const remaining = availableStock - item.scaledQuantity;
    const status =
      ingredient.currentStock <= 0
        ? "out_of_stock"
        : shortageQuantity > 0
          ? "shortage"
          : remaining <= ingredient.reorderLevel
            ? "low_stock_after_use"
            : "enough_stock";
    return {
      ingredientId: item.ingredientId,
      ingredientName: item.ingredientName,
      requiredQuantity: item.scaledQuantity,
      currentStock: ingredient.currentStock,
      reservedStock,
      availableStock,
      shortageQuantity,
      status
    };
  });
}

export function calculateRecipeCost(recipeId: string, requestedYieldQuantity: number) {
  const recipe = recipes.find((item) => item.id === recipeId);
  const scaled = scaleRecipe(recipeId, requestedYieldQuantity);
  const ingredientCostBreakdown = scaled.map(normalizeRequirementToBase).map((item) => {
    const ingredient = ingredients.find((candidate) => candidate.id === item.ingredientId)!;
    const sourceLineAmount = Number(item.prepState?.sourceLineAmount);
    const sourceCost = Number.isFinite(sourceLineAmount) && sourceLineAmount >= 0
      ? sourceLineAmount * item.scaleFactor
      : undefined;
    const sourceQuantity = item.originalQuantity * item.scaleFactor;
    const unitCost = sourceCost !== undefined && sourceQuantity > 0
      ? sourceCost / sourceQuantity
      : ingredient.latestUnitCost;
    return { ...item, unitCost, cost: sourceCost ?? item.scaledQuantity * ingredient.latestUnitCost };
  });
  const ingredientSubtotal = ingredientCostBreakdown.reduce((sum, item) => sum + item.cost, 0);
  const costProfile = recipe?.costProfile ?? {};
  const scaleFactor = recipe ? requestedYieldQuantity / recipe.baseYieldQuantity : 1;
  const laborCost = ((costProfile.laborMinutes ?? 0) * scaleFactor / 60) * (costProfile.laborRatePerHour ?? 0);
  const packagingCost = (costProfile.packagingCost ?? 0) * scaleFactor;
  const overheadCost = (costProfile.overheadCost ?? 0) * scaleFactor;
  const utilityCost = (costProfile.utilityCost ?? 0) * scaleFactor;
  const directCost = ingredientSubtotal + laborCost + packagingCost + overheadCost + utilityCost;
  const failureAllowanceCost = directCost * ((costProfile.failureAllowancePercentage ?? 0) / 100);
  const totalRecipeCost = directCost + failureAllowanceCost;
  const effectiveYieldQuantity = Math.max(0.001, requestedYieldQuantity * (1 - Math.min(99, costProfile.yieldLossPercentage ?? 0) / 100));
  const nonIngredientCostBreakdown = [
    { label: "Labor", cost: laborCost },
    { label: "Packaging", cost: packagingCost },
    { label: "Overhead", cost: overheadCost },
    { label: "Utilities", cost: utilityCost },
    { label: "Failure allowance", cost: failureAllowanceCost }
  ].filter((item) => item.cost > 0);
  return {
    ingredientSubtotal,
    nonIngredientCost: totalRecipeCost - ingredientSubtotal,
    nonIngredientCostBreakdown,
    effectiveYieldQuantity,
    totalRecipeCost,
    costPerYieldUnit: totalRecipeCost / effectiveYieldQuantity,
    ingredientCostBreakdown
  };
}

export function calculateMargin(sellingPrice: number, costPrice: number) {
  const grossProfit = sellingPrice - costPrice;
  return {
    sellingPrice,
    costPrice,
    grossProfit,
    grossMarginPercentage: sellingPrice > 0 ? (grossProfit / sellingPrice) * 100 : 0
  };
}

export function netSellingPrice(grossPrice: number) {
  const taxRate = (settings.defaultTaxPercentage ?? 0) / 100;
  return taxRate > 0 ? grossPrice / (1 + taxRate) : grossPrice;
}

export interface OrderPricingInput {
  lines: { saleQuantity: number; unitSellingPrice: number }[];
  deliveryFee?: number;
  discountAmount?: number;
  taxRate?: number;
  amountPaid?: number;
}

export interface OrderPricing {
  lines: { saleQuantity: number; unitSellingPrice: number; lineTotal: number }[];
  subtotal: number;
  discountAmount: number;
  deliveryFee: number;
  taxRate: number;
  taxAmount: number;
  netTotal: number;
  grossTotal: number;
  amountPaid: number;
  balance: number;
  hasPricing: boolean;
}

function pricingMoney(value: number | undefined | null): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function roundToCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// Frontend preview mirror of the API's authoritative computeOrderPricing. Clamps
// invalid inputs to zero for a live preview; the persisted order totals returned
// by the server remain the source of truth after save.
export function computeOrderPricing(input: OrderPricingInput): OrderPricing {
  const lines = (input.lines ?? []).map((line) => {
    const saleQuantity = pricingMoney(line.saleQuantity);
    const unitSellingPrice = pricingMoney(line.unitSellingPrice);
    return { saleQuantity, unitSellingPrice, lineTotal: roundToCents(saleQuantity * unitSellingPrice) };
  });
  const subtotal = roundToCents(lines.reduce((sum, line) => sum + line.lineTotal, 0));
  const discountAmount = Math.min(roundToCents(pricingMoney(input.discountAmount)), subtotal);
  const netTotal = roundToCents(subtotal - discountAmount);
  const taxRate = pricingMoney(input.taxRate);
  const taxAmount = roundToCents((netTotal * taxRate) / 100);
  const deliveryFee = roundToCents(pricingMoney(input.deliveryFee));
  const grossTotal = roundToCents(netTotal + taxAmount + deliveryFee);
  const amountPaid = roundToCents(pricingMoney(input.amountPaid));
  return {
    lines, subtotal, discountAmount, deliveryFee, taxRate, taxAmount, netTotal, grossTotal, amountPaid,
    balance: roundToCents(grossTotal - amountPaid),
    hasPricing: lines.some((line) => line.unitSellingPrice > 0)
  };
}

export function requirementsForOrder(orderId: string, allOrderItems = orderItems) {
  const lines = allOrderItems.filter((item) => item.orderId === orderId);
  return requirementsForOrderLines(lines);
}

function addDaysIso(iso: string, delta: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

// Recommended order-by date = the earliest due date that needs the ingredient
// minus the supplier lead time, never earlier than today. With no due order,
// order today because the item is already below its reorder level.
export function recommendedRestockDate(todayIso: string, nextDueDate: string | undefined, leadTimeDays: number): string {
  if (!nextDueDate) return todayIso;
  const orderBy = addDaysIso(nextDueDate, -Math.max(0, leadTimeDays));
  return orderBy < todayIso ? todayIso : orderBy;
}

export interface RestockSuggestion {
  ingredientId: string;
  ingredientName: string;
  currentStock: number;
  reorderLevel: number;
  unit: Unit;
  shortfall: number;
  leadTimeDays: number;
  relevantOrderCount: number;
  nextDueDate?: string;
  recommendedOrderByDate: string;
  reason: string;
}

// Data-derived restock guidance (PCO-014): every suggestion is grounded in real
// stock, reorder level, the active orders that consume the ingredient, and the
// supplier lead time. No decorative or fabricated dates.
export function restockSuggestions(todayIso: string): RestockSuggestion[] {
  const activeOrders = orders.filter((order) => !["Delivered", "Cancelled"].includes(order.status));
  return ingredients
    .filter((ingredient) => Number(ingredient.reorderLevel) > 0 && Number(ingredient.currentStock) <= Number(ingredient.reorderLevel))
    .map((ingredient) => {
      const supplier = suppliers.find((candidate) => candidate.id === ingredient.supplierId);
      const leadTimeDays = Math.max(0, Number(supplier?.leadTimeDays ?? 0));
      const dueDates = activeOrders
        .filter((order) => requirementsForOrder(order.id).some((requirement) => requirement.ingredientId === ingredient.id))
        .map((order) => order.dueDate)
        .filter(Boolean)
        .sort();
      const nextDueDate = dueDates[0];
      const shortfall = Math.max(0, Number(ingredient.reorderLevel) - Number(ingredient.currentStock));
      return {
        ingredientId: ingredient.id,
        ingredientName: ingredient.name,
        currentStock: Number(ingredient.currentStock),
        reorderLevel: Number(ingredient.reorderLevel),
        unit: ingredient.baseUnit,
        shortfall,
        leadTimeDays,
        relevantOrderCount: dueDates.length,
        nextDueDate,
        recommendedOrderByDate: recommendedRestockDate(todayIso, nextDueDate, leadTimeDays),
        reason: nextDueDate
          ? `Below reorder level with an order due ${nextDueDate}; supplier lead time ${leadTimeDays} day${leadTimeDays === 1 ? "" : "s"}.`
          : `Below reorder level; supplier lead time ${leadTimeDays} day${leadTimeDays === 1 ? "" : "s"}.`
      };
    })
    .sort((a, b) => a.recommendedOrderByDate.localeCompare(b.recommendedOrderByDate) || a.ingredientName.localeCompare(b.ingredientName));
}

export function calculateOrderCost(orderId: string) {
  return orderItems
    .filter((item) => item.orderId === orderId)
    .reduce((sum, item) => sum + calculateRecipeCost(item.recipeId, item.requestedYieldQuantity * item.quantityMultiplier).totalRecipeCost, 0);
}

function normalizeRequirementToBase(item: ScaledIngredient): ScaledIngredient {
  const ingredient = ingredients.find((candidate) => candidate.id === item.ingredientId);
  if (!ingredient || item.unit === ingredient.baseUnit) return item;
  const conversion = convertUnit(item.scaledQuantity, item.unit, ingredient.baseUnit, ingredient.id, conversionRules, {
    ingredientState: item.prepState?.ingredientState,
    temperatureState: item.prepState?.temperatureState,
    formulaContext: item.formulaContext
  });
  return {
    ...item,
    scaledQuantity: conversion.needsReview ? item.scaledQuantity : Number(conversion.convertedQuantity.toFixed(3)),
    unit: conversion.needsReview ? item.unit : ingredient.baseUnit
  };
}

function estimatedUnitCost(ingredient: Ingredient) {
  if (ingredient.latestUnitCost > 0) return ingredient.latestUnitCost;
  if (ingredient.category === "Packaging") return 100;
  if (["pcs", "egg", "yolk", "white"].includes(ingredient.baseUnit)) return 250;
  if (["ml", "litre"].includes(ingredient.baseUnit)) return 15;
  return 5;
}

function isBelowReorder(ingredient: Ingredient) {
  return ingredient.reorderLevel > 0 && ingredient.currentStock <= ingredient.reorderLevel;
}

export function generateShoppingList(orderIds = orders.filter((order) => ["Confirmed", "Stock Reserved", "In Production"].includes(order.status)).map((order) => order.id)) {
  const orderRequirements = combineRequirements(orderIds.flatMap((orderId) => requirementsForOrder(orderId).map(normalizeRequirementToBase)));
  const lowStockLines = ingredients
    .filter(isBelowReorder)
    .map((ingredient) => ({
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      scaledQuantity: 0,
      unit: ingredient.baseUnit,
      originalQuantity: 0,
      scaleFactor: 1
    }));
  return combineRequirements([...orderRequirements, ...lowStockLines]).map((item) => {
    const ingredient = ingredients.find((candidate) => candidate.id === item.ingredientId)!;
    const available = ingredient.currentStock - (ingredient.reservedStock ?? 0);
    const afterUse = available - item.scaledQuantity;
    const shortage = Math.max(0, item.scaledQuantity - available);
    const reorderTopUp = Math.max(0, ingredient.reorderLevel - afterUse);
    const safetyMargin = 1 + ((settings.safetyMarginPercentage ?? 0) / 100);
    const thresholdTopUp = item.scaledQuantity === 0 && available <= ingredient.reorderLevel && ingredient.reorderLevel > 0 ? ingredient.reorderLevel : 0;
    const suggestedBuyQuantity = roundByPreference((shortage + reorderTopUp + thresholdTopUp) * safetyMargin, ingredient.baseUnit);
    const unitCost = estimatedUnitCost(ingredient);
    const supplier = suppliers.find((candidate) => candidate.id === ingredient.supplierId);
    const demandOrderCount = orderIds.filter((orderId) => requirementsForOrder(orderId).some((requirement) => requirement.ingredientId === ingredient.id)).length;
    return {
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      currentStock: ingredient.currentStock,
      availableStock: available,
      requiredQuantity: item.scaledQuantity,
      shortageQuantity: shortage,
      reorderLevel: ingredient.reorderLevel,
      suggestedBuyQuantity,
      estimatedCost: suggestedBuyQuantity * unitCost,
      unitCost,
      supplierId: ingredient.supplierId,
      supplier: supplier?.name ?? "Unassigned",
      demandOrderCount,
      reason: shortage > 0 ? "Order shortage" : "Below reorder level",
      unit: ingredient.baseUnit
    };
  }).filter((item) => item.suggestedBuyQuantity > 0);
}

export type DashboardProductionCard = {
  id: string;
  productName: string;
  quantity: string;
  dueDate: string;
  productionStatus: Order["productionStatus"];
  stockStatus: Order["stockStatus"];
};

function isActiveProductionOrder(order: Order) {
  return !["Delivered", "Cancelled"].includes(order.status) && order.productionStatus !== "Completed";
}

function dashboardProductionCard(order: Order, itemList: OrderItem[], productList: Product[], dueLabel: string): DashboardProductionCard {
  const line = itemList.find((item) => item.orderId === order.id);
  const product = productList.find((item) => item.id === line?.productId);
  return {
    id: order.id,
    productName: product?.name ?? "Order item",
    quantity: line ? `${line.requestedYieldQuantity} ${line.yieldUnit}` : "No items",
    dueDate: dueLabel,
    productionStatus: order.productionStatus,
    stockStatus: order.stockStatus
  };
}

export const PRODUCIBLE_ORDER_STATUSES = ["Confirmed", "Stock Reserved", "In Production"];

export function isProducibleStatus(status: string): boolean {
  return PRODUCIBLE_ORDER_STATUSES.includes(status);
}

// Today's date (yyyy-mm-dd) in the business timezone. Africa/Lagos is UTC+1 with
// no DST, but computing the local date avoids the late-night UTC off-by-one that
// `new Date().toISOString()` caused on the old production filters.
export function businessToday(timeZone = "Africa/Lagos"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

// Inclusive-exclusive [start, end) date bounds for a production period, computed
// from a business-timezone "today". Week is the Monday-started week containing today.
export function productionPeriodBounds(period: "today" | "tomorrow" | "week", todayIso: string): { start: string; end: string } {
  if (period === "today") return { start: todayIso, end: addDaysIso(todayIso, 1) };
  if (period === "tomorrow") return { start: addDaysIso(todayIso, 1), end: addDaysIso(todayIso, 2) };
  const dayOfWeek = new Date(`${todayIso}T00:00:00Z`).getUTCDay(); // 0=Sun..6=Sat
  const sinceMonday = (dayOfWeek + 6) % 7;
  const start = addDaysIso(todayIso, -sinceMonday);
  return { start, end: addDaysIso(start, 7) };
}

// Orders eligible for a production bucket: producible status only (never Draft,
// Produced, Delivered, or Cancelled) and due within the bucket's explicit range.
// Today and Tomorrow are single days; This Week is the rest of the Monday-week
// (including earlier-this-week overdue days) excluding today and tomorrow so the
// three sections do not double-list the same order.
export function ordersForProductionBucket(bucket: "Today" | "Tomorrow" | "This Week", todayIso: string, orderList: Order[] = orders): Order[] {
  const tomorrowIso = addDaysIso(todayIso, 1);
  const week = productionPeriodBounds("week", todayIso);
  return orderList.filter((order) => {
    if (!isProducibleStatus(order.status)) return false;
    if (bucket === "Today") return order.dueDate === todayIso;
    if (bucket === "Tomorrow") return order.dueDate === tomorrowIso;
    return order.dueDate >= week.start && order.dueDate < week.end && order.dueDate !== todayIso && order.dueDate !== tomorrowIso;
  });
}

export function dashboardProductionQueue(todayIso = new Date().toISOString().slice(0, 10), orderList = orders, itemList = orderItems, productList = products) {
  const active = orderList.filter(isActiveProductionOrder);
  const todayOrders = active
    .filter((order) => order.dueDate === todayIso)
    .sort((a, b) => a.customerName.localeCompare(b.customerName))
    .slice(0, 3);
  const overdueOrders = active
    .filter((order) => order.dueDate < todayIso)
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate) || a.customerName.localeCompare(b.customerName))
    .slice(0, 3);

  return {
    today: todayOrders.map((order) => dashboardProductionCard(order, itemList, productList, "Due today")),
    overdue: overdueOrders.map((order) => dashboardProductionCard(order, itemList, productList, `Due ${order.dueDate}`))
  };
}

export function buildKitchenAssistantResponse(prompt: string) {
  const lower = prompt.toLowerCase();
  const shopping = generateShoppingList();
  const lowStock = ingredients.filter(isBelowReorder);
  const activeOrders = orders.filter((order) => !["Delivered", "Cancelled"].includes(order.status));
  const shortageOrders = activeOrders.filter((order) => checkOrderStockAvailability(order.id).some((item) => item.shortageQuantity > 0));
  const recipeMatch = recipes.find((recipe) => lower.includes(recipe.name.toLowerCase()));
  const recipe = recipeMatch ?? recipes[0];

  if (lower.includes("buy") || lower.includes("shopping") || lower.includes("restock")) {
    const topItems = shopping.slice(0, 5).map((item) => `${item.ingredientName}: buy ${formatQuantity(item.suggestedBuyQuantity, item.unit)} (${formatNaira(item.estimatedCost)})`).join("\n");
    return topItems ? `Here is the current buying priority from live stock and orders:\n${topItems}\n\nTotal suggested spend: ${formatNaira(shopping.reduce((sum, item) => sum + item.estimatedCost, 0))}.` : "No purchase is currently suggested from active orders and reorder levels.";
  }

  if (lower.includes("shortage") || lower.includes("blocked") || lower.includes("production")) {
    const blocked = shortageOrders.map((order) => `${order.customerName}: ${checkOrderStockAvailability(order.id).filter((item) => item.shortageQuantity > 0).map((item) => `${item.ingredientName} short ${formatQuantity(item.shortageQuantity, requirementsForOrder(order.id).find((requirement) => requirement.ingredientId === item.ingredientId)?.unit ?? "g")}`).join(", ")}`).join("\n");
    return blocked ? `Production blockers found:\n${blocked}\n\nResolve these through Shopping List before starting or completing production.` : "No active order is currently blocked by ingredient shortages.";
  }

  if (lower.includes("cost") || lower.includes("margin") || lower.includes("price")) {
    if (!recipe) return "No recipe is available for costing yet.";
    const cost = calculateRecipeCost(recipe.id, recipe.baseYieldQuantity);
    return `${recipe.name} currently costs ${formatNaira(cost.totalRecipeCost)} per ${recipe.baseYieldQuantity} ${recipe.yieldUnit}, or ${formatNaira(cost.costPerYieldUnit)} per ${recipe.yieldUnit}. Enter the order's real selling price on the order or costing screen to see gross profit and margin.`;
  }

  if (lower.includes("convert") || lower.includes("cup") || lower.includes("gram") || lower.includes("recipe text")) {
    const parsed = parseRecipeText(prompt);
    if (parsed.length) {
      return `I parsed these recipe lines:\n${parsed.map((item) => `${item.ingredientName}: ${item.quantity} ${item.unit} -> ${item.convertedQuantity}${item.convertedUnit} (${item.confidence}${item.needsReview ? ", needs review" : ""})`).join("\n")}`;
    }
    const flour = convertUnit(1, "cup", "g", "flour");
    return `For flour, the current rule converts 1 cup to ${flour.convertedQuantity}g with ${flour.confidenceLevel} confidence. Paste recipe lines and I can parse them into structured quantities.`;
  }

  if (lower.includes("low stock") || lower.includes("inventory")) {
    return lowStock.length ? `Low-stock items right now:\n${lowStock.slice(0, 8).map((item) => `${item.name}: ${formatQuantity(item.currentStock, item.baseUnit)} left; reorder at ${formatQuantity(item.reorderLevel, item.baseUnit)}`).join("\n")}` : "No ingredient is below a positive reorder threshold right now.";
  }

  return `I can help with live kitchen questions. Current snapshot: ${activeOrders.length} active order${activeOrders.length === 1 ? "" : "s"}, ${lowStock.length} low-stock item${lowStock.length === 1 ? "" : "s"}, and ${shopping.length} suggested purchase line${shopping.length === 1 ? "" : "s"}. Try asking about what to buy, production blockers, recipe cost, low stock, or paste recipe measurements for conversion.`;
}

function normalizedScopeValue(value?: string) {
  return String(value ?? "").trim().toLowerCase();
}

function conversionScopeScore(rule: ConversionRule, scope: ConversionScope = {}) {
  const scopedFields: Array<keyof ConversionScope> = ["ingredientState", "temperatureState", "formulaContext"];
  let score = 0;
  for (const field of scopedFields) {
    const ruleValue = normalizedScopeValue(rule[field]);
    if (!ruleValue) continue;
    if (ruleValue !== normalizedScopeValue(scope[field])) return -1;
    score += 1;
  }
  return score;
}

export function convertUnit(quantity: number, fromUnit: Unit, toUnit: Unit, ingredientId?: string, rules: ConversionRule[] = conversionRules, scope: ConversionScope = {}) {
  if (fromUnit === toUnit) return { convertedQuantity: quantity, confidenceLevel: "High" as const, source: "direct", needsReview: false };
  if (String(ingredientId ?? "").toLowerCase().includes("egg") && ((fromUnit === "egg" && toUnit === "pcs") || (fromUnit === "pcs" && toUnit === "egg"))) {
    return { convertedQuantity: quantity, confidenceLevel: "High" as const, source: "direct egg count", needsReview: false };
  }
  const direct: Record<string, number> = {
    "kg:g": 1000,
    "g:kg": 0.001,
    "litre:ml": 1000,
    "ml:litre": 0.001,
    "tablespoon:ml": 15,
    "teaspoon:ml": 5
  };
  const directFactor = direct[`${fromUnit}:${toUnit}`];
  if (directFactor) return { convertedQuantity: quantity * directFactor, confidenceLevel: "High" as const, source: "direct", needsReview: false };
  const rule = rules
    .map((candidate) => ({ candidate, score: candidate.ingredientId === ingredientId && candidate.fromUnit === fromUnit && candidate.toUnit === toUnit && candidate.active !== false ? conversionScopeScore(candidate, scope) : -1 }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score || Number(b.candidate.verified) - Number(a.candidate.verified))[0]?.candidate;
  if (rule) {
    return {
      convertedQuantity: quantity * rule.conversionFactor,
      confidenceLevel: rule.confidenceLevel,
      source: rule.source,
      needsReview: !rule.verified
    };
  }
  return { convertedQuantity: quantity, confidenceLevel: "Low" as const, source: "AI estimate required", needsReview: true };
}

export function parseRecipeText(text: string) {
  const normalizeUnit = (value: string): Unit => {
    const unit = value.toLowerCase().trim().replace(/[.?!,;:]+$/g, "");
    const aliases: Record<string, Unit> = {
      cups: "cup",
      tbsp: "tablespoon",
      tablespoons: "tablespoon",
      tsp: "teaspoon",
      teaspoons: "teaspoon",
      grams: "g",
      gram: "g",
      kilograms: "kg",
      kilogram: "kg",
      millilitres: "ml",
      milliliters: "ml",
      litres: "litre",
      liters: "litre",
      pieces: "pcs",
      piece: "pcs",
      eggs: "egg",
      "egg yolks": "yolk",
      "egg yolk": "yolk",
      "egg whites": "white",
      "egg white": "white",
      yolks: "yolk",
      whites: "white",
      packs: "pack",
      rolls: "roll"
    };
    return aliases[unit] ?? unit as Unit;
  };
  const unitPattern = "egg\\s+yolks?|egg\\s+whites?|cups?|tbsp|tablespoons?|tsp|teaspoons?|grams?|g|kg|kilograms?|ml|milliliters?|millilitres?|liters?|litres?|pcs|pieces?|eggs?|yolks?|whites?|packs?|rolls?";
  const splitSourceUnit = (source: string) => {
    const aliases = [
      "egg yolks", "egg yolk", "egg whites", "egg white", "tablespoons", "tablespoon", "teaspoons", "teaspoon",
      "millilitres", "milliliters", "kilograms", "kilogram", "litres", "liters", "pieces", "piece",
      "cups", "cup", "tbsp", "tsp", "grams", "gram", "eggs", "egg", "yolks", "yolk", "whites", "white",
      "packs", "pack", "rolls", "roll", "kg", "ml", "pcs", "g"
    ];
    const lowerSource = source.toLowerCase().trim().replace(/[.?!,;:]+$/g, "");
    const sizedEgg = lowerSource.match(/^(?:large|medium|small)\s+(eggs?|egg\s+yolks?|egg\s+whites?)$/);
    if (sizedEgg) {
      const eggName = sizedEgg[1];
      return { unit: normalizeUnit(eggName), ingredientName: eggName };
    }
    const alias = aliases.find((candidate) => lowerSource === candidate || lowerSource.startsWith(`${candidate} `));
    if (!alias) return { unit: undefined, ingredientName: source.trim() };
    const ingredientName = lowerSource === alias ? source.trim() : source.slice(alias.length).trim();
    return { unit: normalizeUnit(alias), ingredientName: ingredientName || source.trim() };
  };
  const findIngredient = (name: string) => {
    const normalizedIngredient = name.toLowerCase().trim();
    const singularIngredient = normalizedIngredient.replace(/s$/, "");
    return ingredients.find((candidate) => candidate.name.toLowerCase() === normalizedIngredient)
      ?? ingredients.find((candidate) => candidate.name.toLowerCase().replace(/s$/, "") === singularIngredient)
      ?? ingredients.find((candidate) => normalizedIngredient.includes(candidate.name.toLowerCase()))
      ?? ingredients.find((candidate) => candidate.name.toLowerCase().includes(normalizedIngredient))
      ?? ingredients.find((candidate) => normalizedIngredient.includes(candidate.name.toLowerCase().split(" ")[0]));
  };
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const cleanLine = line.replace(/[.?!]+$/g, "").trim();
      const conversionQuestion = cleanLine.match(new RegExp(`^(?:convert\\s+)?(\\d+(?:\\.\\d+)?|\\d+\\/\\d+)\\s+(.+?)\\s+(?:to|into|in)\\s+(${unitPattern})$`, "i"));
      if (conversionQuestion) {
        const quantityRaw = conversionQuestion[1];
        const quantity = quantityRaw.includes("/") ? quantityRaw.split("/").map(Number).reduce((a, b) => a / b) : Number(quantityRaw);
        const { unit, ingredientName } = splitSourceUnit(conversionQuestion[2]);
        const ingredient = findIngredient(ingredientName);
        const fromUnit = unit ?? ingredient?.baseUnit ?? "pcs";
        const toUnit = normalizeUnit(conversionQuestion[3]);
        const conversion = ingredient ? convertUnit(quantity, fromUnit, toUnit, ingredient.id) : undefined;
        return {
          id: `parsed-${index}`,
          ingredientName: ingredient?.name ?? ingredientName,
          ingredientId: ingredient?.id,
          quantity,
          unit: fromUnit,
          convertedQuantity: conversion?.convertedQuantity ?? quantity,
          convertedUnit: toUnit,
          confidence: conversion?.confidenceLevel ?? "Low",
          needsReview: !ingredient || conversion?.needsReview
        };
      }
      const match = line.match(new RegExp(`^(\\d+(?:\\.\\d+)?|\\d+\\/\\d+)\\s+(?:(${unitPattern})\\s+)?(.+)$`, "i"));
      const quantityRaw = match?.[1] ?? "1";
      const quantity = quantityRaw.includes("/") ? quantityRaw.split("/").map(Number).reduce((a, b) => a / b) : Number(quantityRaw);
      const ingredientName = (match?.[3] ?? match?.[2] ?? line).trim();
      const ingredient = findIngredient(ingredientName);
      const inferredCountUnit = ingredientName.toLowerCase().includes("yolk") ? "yolk" : ingredientName.toLowerCase().includes("white") ? "white" : ingredientName.toLowerCase().includes("egg") ? "egg" : undefined;
      const unit = match?.[2] ? normalizeUnit(match[2]) : inferredCountUnit ?? ingredient?.baseUnit ?? "pcs";
      const conversion = ingredient ? convertUnit(quantity, unit, ingredient.baseUnit, ingredient.id) : undefined;
      return {
        id: `parsed-${index}`,
        ingredientName,
        ingredientId: ingredient?.id,
        quantity,
        unit,
        convertedQuantity: conversion?.convertedQuantity ?? quantity,
        convertedUnit: ingredient?.baseUnit ?? unit,
        confidence: conversion?.confidenceLevel ?? "Low",
        needsReview: !ingredient || conversion?.needsReview
      };
    });
}

export function createOrder(orderData: Omit<Order, "id" | "productionStatus" | "stockStatus">, items: Omit<OrderItem, "id" | "orderId">[]) {
  const id = `ord-${Date.now()}`;
  const createdItems: OrderItem[] = items.map((item, index) => ({ ...item, id: `oi-${Date.now()}-${index}`, orderId: id }));
  const requirements = combineRequirements(createdItems.flatMap((item) => scaleRecipe(item.recipeId, item.requestedYieldQuantity * item.quantityMultiplier)));
  const availability = checkStockAvailability(requirements);
  const stockStatus = availability.some((item) => item.status === "shortage" || item.status === "out_of_stock") ? "Shortage" : "In Stock";
  return {
    order: { ...orderData, id, productionStatus: "Not Started" as const, stockStatus },
    items: createdItems,
    requirements,
    availability,
    estimatedCost: requirements.reduce((sum, item) => sum + item.scaledQuantity * (ingredients.find((ingredient) => ingredient.id === item.ingredientId)?.latestUnitCost ?? 0), 0)
  };
}

export function reserveStockForOrder(orderId: string) {
  const requirements = requirementsForOrder(orderId);
  const availability = checkStockAvailability(requirements);
  if (availability.some((item) => item.status === "shortage" || item.status === "out_of_stock")) {
    return { reserved: false, shortages: availability.filter((item) => item.shortageQuantity > 0) };
  }
  return {
    reserved: true,
    movements: requirements.map((item) => ({
      ingredientId: item.ingredientId,
      movementType: "reservation" as const,
      quantityChange: item.scaledQuantity,
      unit: item.unit,
      relatedOrderId: orderId,
      note: `Reserved ${item.scaledQuantity}${item.unit} for order ${orderId}`
    }))
  };
}

export function markOrderAsProduced(orderId: string, ingredientList: Ingredient[] = ingredients) {
  const requirements = requirementsForOrder(orderId);
  const availability = checkStockAvailability(requirements, ingredientList);
  if (!settings.allowNegativeInventory && availability.some((item) => item.status === "shortage" || item.status === "out_of_stock")) {
    return { produced: false, shortages: availability.filter((item) => item.shortageQuantity > 0), updatedIngredients: ingredientList };
  }
  const updatedIngredients = ingredientList.map((ingredient) => {
    const requirement = requirements.find((item) => item.ingredientId === ingredient.id);
    return requirement ? { ...ingredient, currentStock: ingredient.currentStock - requirement.scaledQuantity, reservedStock: Math.max(0, (ingredient.reservedStock ?? 0) - requirement.scaledQuantity) } : ingredient;
  });
  return { produced: true, shortages: [], updatedIngredients };
}

export function recipeById(id: string): Recipe {
  const recipe = recipes.find((item) => item.id === id);
  if (!recipe) throw new Error(`Recipe ${id} was not found`);
  return recipe;
}

export function itemsForRecipe(id: string): RecipeItem[] {
  return recipeItems.filter((item) => item.recipeId === id);
}
