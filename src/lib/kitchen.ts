import { conversionRules, ingredients, orderItems, orders, recipeItems, recipes, settings, suppliers } from "../data";
import type { ConversionRule, Ingredient, Order, OrderItem, Recipe, RecipeItem, Unit } from "../types";

export interface ScaledIngredient {
  ingredientId: string;
  ingredientName: string;
  originalQuantity: number;
  scaledQuantity: number;
  unit: Unit;
  scaleFactor: number;
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
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(value);
}

export function roundByPreference(value: number, unit: Unit) {
  if (unit === "g") return Math.round(value / settings.gramRoundingPreference) * settings.gramRoundingPreference;
  if (unit === "ml") return Math.round(value / 5) * 5;
  if (["pcs", "pack", "roll"].includes(unit)) return Math.ceil(value);
  return Number(value.toFixed(2));
}

export function roundScaledQuantity(value: number, unit: Unit) {
  if (["pcs", "pack", "roll", "egg", "yolk", "white"].includes(unit)) return Math.ceil(value);
  if (["g", "kg", "ml", "litre", "cup", "tablespoon", "teaspoon"].includes(unit)) return Number(value.toFixed(1));
  return Number(value.toFixed(2));
}

export function scaleRecipe(recipeId: string, requestedYieldQuantity: number, recipeList = recipes, itemList = recipeItems, ingredientList = ingredients): ScaledIngredient[] {
  const recipe = recipeList.find((item) => item.id === recipeId);
  if (!recipe) throw new Error(`Recipe ${recipeId} was not found`);
  const scaleFactor = requestedYieldQuantity / recipe.baseYieldQuantity;
  return itemList
    .filter((item) => item.recipeId === recipeId)
    .map((item) => {
      const ingredient = ingredientList.find((candidate) => candidate.id === item.ingredientId);
      if (!ingredient) throw new Error(`Ingredient ${item.ingredientId} was not found`);
      const withWaste = item.quantity * (1 + (item.wastePercentage ?? 0) / 100);
      return {
        ingredientId: ingredient.id,
        ingredientName: ingredient.name,
        originalQuantity: item.quantity,
        scaledQuantity: roundScaledQuantity(withWaste * scaleFactor, item.unit),
        unit: item.unit,
        scaleFactor
      };
    });
}

export function combineRequirements(requirements: ScaledIngredient[]) {
  const map = new Map<string, ScaledIngredient>();
  requirements.forEach((item) => {
    const key = `${item.ingredientId}:${item.unit}`;
    const existing = map.get(key);
    if (existing) existing.scaledQuantity += item.scaledQuantity;
    else map.set(key, { ...item });
  });
  return Array.from(map.values());
}

export function checkStockAvailability(scaledIngredients: ScaledIngredient[], ingredientList = ingredients): StockAvailability[] {
  return scaledIngredients.map((item) => {
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

export function calculateRecipeCost(recipeId: string, requestedYieldQuantity: number) {
  const scaled = scaleRecipe(recipeId, requestedYieldQuantity);
  const ingredientCostBreakdown = scaled.map((item) => {
    const ingredient = ingredients.find((candidate) => candidate.id === item.ingredientId)!;
    return { ...item, unitCost: ingredient.latestUnitCost, cost: item.scaledQuantity * ingredient.latestUnitCost };
  });
  const totalRecipeCost = ingredientCostBreakdown.reduce((sum, item) => sum + item.cost, 0);
  return {
    totalRecipeCost,
    costPerYieldUnit: totalRecipeCost / requestedYieldQuantity,
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

export function requirementsForOrder(orderId: string, allOrderItems = orderItems) {
  const lines = allOrderItems.filter((item) => item.orderId === orderId);
  return combineRequirements(lines.flatMap((line) => scaleRecipe(line.recipeId, line.requestedYieldQuantity * line.quantityMultiplier)));
}

export function calculateOrderCost(orderId: string) {
  const requirements = requirementsForOrder(orderId);
  return requirements.reduce((sum, item) => {
    const ingredient = ingredients.find((candidate) => candidate.id === item.ingredientId)!;
    return sum + item.scaledQuantity * ingredient.latestUnitCost;
  }, 0);
}

export function generateShoppingList(orderIds = orders.filter((order) => ["Confirmed", "Stock Reserved", "In Production"].includes(order.status)).map((order) => order.id)) {
  const orderRequirements = combineRequirements(orderIds.flatMap((orderId) => requirementsForOrder(orderId)));
  const lowStockLines = ingredients
    .filter((ingredient) => ingredient.currentStock <= ingredient.reorderLevel)
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
    const suggestedBuyQuantity = roundByPreference(shortage + reorderTopUp, ingredient.baseUnit);
    const supplier = suppliers.find((candidate) => candidate.id === ingredient.supplierId);
    return {
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      currentStock: ingredient.currentStock,
      requiredQuantity: item.scaledQuantity,
      shortageQuantity: shortage,
      reorderLevel: ingredient.reorderLevel,
      suggestedBuyQuantity,
      estimatedCost: suggestedBuyQuantity * ingredient.latestUnitCost,
      supplier: supplier?.name ?? "Unassigned",
      unit: ingredient.baseUnit
    };
  }).filter((item) => item.suggestedBuyQuantity > 0);
}

export function convertUnit(quantity: number, fromUnit: Unit, toUnit: Unit, ingredientId?: string, rules: ConversionRule[] = conversionRules) {
  if (fromUnit === toUnit) return { convertedQuantity: quantity, confidenceLevel: "High" as const, source: "direct", needsReview: false };
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
  const rule = rules.find((candidate) => candidate.ingredientId === ingredientId && candidate.fromUnit === fromUnit && candidate.toUnit === toUnit);
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
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const match = line.match(/^(\d+(?:\.\d+)?|\d+\/\d+)\s+([a-zA-Z]+)\s+(.+)$/);
      const quantityRaw = match?.[1] ?? "1";
      const quantity = quantityRaw.includes("/") ? quantityRaw.split("/").map(Number).reduce((a, b) => a / b) : Number(quantityRaw);
      const unit = (match?.[2] ?? "pcs").toLowerCase() as Unit;
      const ingredientName = (match?.[3] ?? line).trim();
      const ingredient = ingredients.find((candidate) => ingredientName.toLowerCase().includes(candidate.name.toLowerCase().split(" ")[0]));
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
