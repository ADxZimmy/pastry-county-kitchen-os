import { beforeEach, describe, expect, it } from "vitest";
import { setKitchenSnapshot } from "./data";
import { calculateMargin, calculateRecipeCost, checkStockAvailability, convertUnit, formatNaira, formatQuantity, generateShoppingList, parseRecipeText, roundScaledQuantity, scaleRecipe } from "./lib/kitchen";

describe("kitchen calculations", () => {
  beforeEach(() => {
    setKitchenSnapshot({
      suppliers: [{ id: "sup-market", name: "Market", contactName: "Ade", phone: "", email: "", address: "", defaultCurrency: "NGN", notes: "" }],
      ingredients: [
        { id: "flour", name: "Flour", category: "Dry Goods", baseUnit: "g", currentStock: 10000, reorderLevel: 3000, latestUnitCost: 0.5, supplierId: "sup-market" },
        { id: "sugar", name: "Sugar", category: "Dry Goods", baseUnit: "g", currentStock: 8000, reorderLevel: 2500, latestUnitCost: 0.62, supplierId: "sup-market" },
        { id: "cocoa", name: "Cocoa Powder", category: "Chocolate", baseUnit: "g", currentStock: 2000, reorderLevel: 800, latestUnitCost: 4.2, supplierId: "sup-market" },
        { id: "dark-chocolate", name: "Dark Chocolate", category: "Chocolate", baseUnit: "g", currentStock: 450, reorderLevel: 1000, latestUnitCost: 7.8, supplierId: "sup-market" },
        { id: "eggs", name: "Eggs", category: "Dairy", baseUnit: "pcs", currentStock: 8, reorderLevel: 30, latestUnitCost: 160, supplierId: "sup-market" },
        { id: "egg-yolks", name: "Egg Yolks", category: "Dairy", baseUnit: "g", currentStock: 0, reorderLevel: 0, latestUnitCost: 3.2, supplierId: "sup-market" },
        { id: "coconut-oil", name: "Coconut Oil", category: "Dairy", baseUnit: "ml", currentStock: 3000, reorderLevel: 1000, latestUnitCost: 2.8, supplierId: "sup-market" },
        { id: "lemon", name: "Lemon", category: "Fruits", baseUnit: "pcs", currentStock: 20, reorderLevel: 12, latestUnitCost: 120, supplierId: "sup-market" },
        { id: "blueberries", name: "Blueberries", category: "Fruits", baseUnit: "g", currentStock: 300, reorderLevel: 500, latestUnitCost: 9.5, supplierId: "sup-market" }
      ],
      products: [
        { id: "classic-brownies", name: "Classic Brownies", category: "Brownies", description: "", active: true },
        { id: "lemon-blueberry-loaf", name: "Lemon Blueberry Loaf", category: "Loaves", description: "", active: true },
        { id: "cup-test-cake", name: "Cup Test Cake", category: "Cakes", description: "", active: true }
      ],
      recipes: [
        { id: "recipe-classic", productId: "classic-brownies", name: "Classic Brownies", category: "Brownies", baseYieldQuantity: 16, yieldUnit: "pieces", instructions: [], active: true, updatedAt: "2026-05-18" },
        { id: "recipe-lemon", productId: "lemon-blueberry-loaf", name: "Lemon Blueberry Loaf", category: "Loaves", baseYieldQuantity: 1, yieldUnit: "loaf", instructions: [], active: true, updatedAt: "2026-05-18" },
        { id: "recipe-cup-test", productId: "cup-test-cake", name: "Cup Test Cake", category: "Cakes", baseYieldQuantity: 1, yieldUnit: "cake", instructions: [], active: true, updatedAt: "2026-05-18" }
      ],
      recipeItems: [
        { id: "ri-1", recipeId: "recipe-classic", ingredientId: "flour", quantity: 300, unit: "g" },
        { id: "ri-2", recipeId: "recipe-classic", ingredientId: "sugar", quantity: 500, unit: "g" },
        { id: "ri-3", recipeId: "recipe-classic", ingredientId: "cocoa", quantity: 120, unit: "g" },
        { id: "ri-4", recipeId: "recipe-classic", ingredientId: "dark-chocolate", quantity: 250, unit: "g" },
        { id: "ri-5", recipeId: "recipe-classic", ingredientId: "eggs", quantity: 4, unit: "pcs" },
        { id: "ri-6", recipeId: "recipe-classic", ingredientId: "coconut-oil", quantity: 180, unit: "ml" },
        { id: "ri-20", recipeId: "recipe-lemon", ingredientId: "flour", quantity: 420, unit: "g" },
        { id: "ri-22", recipeId: "recipe-lemon", ingredientId: "eggs", quantity: 3, unit: "pcs" },
        { id: "ri-24", recipeId: "recipe-lemon", ingredientId: "blueberries", quantity: 400, unit: "g" },
        { id: "ri-cup-test", recipeId: "recipe-cup-test", ingredientId: "flour", quantity: 2, unit: "cup" }
      ],
      orders: [
        { id: "ord-chika", customerName: "Chika", customerPhone: "", dueDate: "2026-05-18", deliveryMethod: "Pickup", status: "Confirmed", paymentStatus: "Paid", productionStatus: "Ready", stockStatus: "Shortage" },
        { id: "ord-tolu", customerName: "Tolu", customerPhone: "", dueDate: "2026-05-19", deliveryMethod: "Delivery", status: "Confirmed", paymentStatus: "Paid", productionStatus: "Not Started", stockStatus: "Shortage" }
      ],
      orderItems: [
        { id: "oi-1", orderId: "ord-chika", productId: "classic-brownies", recipeId: "recipe-classic", requestedYieldQuantity: 12, yieldUnit: "pieces", quantityMultiplier: 1 },
        { id: "oi-2", orderId: "ord-tolu", productId: "lemon-blueberry-loaf", recipeId: "recipe-lemon", requestedYieldQuantity: 2, yieldUnit: "loaves", quantityMultiplier: 1 }
      ],
      inventoryMovements: [],
      conversionRules: [
        { id: "cr-flour", ingredientId: "flour", fromUnit: "cup", toUnit: "g", conversionFactor: 120, conversionType: "ingredient_specific", confidenceLevel: "High", source: "seed rule", verified: true, updatedAt: "2026-05-18" },
        { id: "cr-yolk", ingredientId: "egg-yolks", fromUnit: "yolk", toUnit: "g", conversionFactor: 18, conversionType: "ingredient_specific", confidenceLevel: "Medium", source: "seed rule", verified: true, updatedAt: "2026-05-18" }
      ],
      settings: { businessName: "Pastry County", currency: "NGN", defaultDeductionStage: "production_completion", allowNegativeInventory: false, requireAiConversionConfirmation: true, gramRoundingPreference: 5, eggRoundingPreference: "nearest_whole_egg" }
    });
  });

  it("scales Classic Brownies from 16 pieces to 12 pieces", () => {
    const scaled = scaleRecipe("recipe-classic", 12);
    expect(scaled.find((item) => item.ingredientName === "Flour")?.scaledQuantity).toBe(225);
    expect(scaled.find((item) => item.ingredientName === "Sugar")?.scaledQuantity).toBe(375);
    expect(scaled.find((item) => item.ingredientName === "Dark Chocolate")?.scaledQuantity).toBe(187.5);
    expect(scaled.find((item) => item.ingredientName === "Eggs")?.scaledQuantity).toBe(3);
  });

  it("uses consistent quantity rounding for audit scaling cases", () => {
    expect(roundScaledQuantity(187.5, "g")).toBe(187.5);
    expect(roundScaledQuantity(187.54, "g")).toBe(187.5);
    expect(roundScaledQuantity(2.25, "pcs")).toBe(3);
    expect(scaleRecipe("recipe-classic", 8).find((item) => item.ingredientName === "Dark Chocolate")?.scaledQuantity).toBe(125);
    expect(scaleRecipe("recipe-classic", 24).find((item) => item.ingredientName === "Dark Chocolate")?.scaledQuantity).toBe(375);
  });

  it("detects shortages against available stock", () => {
    const availability = checkStockAvailability(scaleRecipe("recipe-classic", 96));
    expect(availability.some((item) => item.status === "shortage")).toBe(true);
  });

  it("calculates recipe cost and margin", () => {
    const cost = calculateRecipeCost("recipe-classic", 12);
    expect(cost.totalRecipeCost).toBeGreaterThan(0);
    const margin = calculateMargin(18000, cost.totalRecipeCost);
    expect(margin.grossProfit).toBeCloseTo(18000 - cost.totalRecipeCost);
  });

  it("keeps precision for sub-naira and fractional unit costs", () => {
    expect(formatNaira(0.5)).toBe("₦0.50");
    expect(formatNaira(0.64)).toBe("₦0.64");
    expect(formatNaira(2.75)).toBe("₦2.75");
    expect(formatNaira(160)).toBe("₦160");
  });

  it("formats count quantities without decimal noise", () => {
    expect(formatQuantity(2.1, "pcs")).toBe("3pcs");
    expect(formatQuantity(4.01, "pack")).toBe("5pack");
    expect(formatQuantity(187.5, "g")).toBe("187.5g");
  });

  it("uses ingredient-specific conversion rules", () => {
    expect(convertUnit(4, "cup", "g", "flour").convertedQuantity).toBe(480);
    expect(convertUnit(3, "yolk", "g", "egg-yolks").convertedQuantity).toBe(54);
  });

  it("reuses saved conversion rules when costing recipe ingredients", () => {
    const cost = calculateRecipeCost("recipe-cup-test", 1);
    expect(cost.ingredientCostBreakdown[0]).toMatchObject({ ingredientName: "Flour", scaledQuantity: 240, unit: "g" });
    expect(cost.totalRecipeCost).toBeCloseTo(120);
  });

  it("parses plural recipe units and count ingredients", () => {
    const parsed = parseRecipeText("2 cups flour\n4 eggs");
    expect(parsed.find((item) => item.ingredientName === "flour")?.convertedQuantity).toBe(240);
    expect(parsed.find((item) => item.ingredientName === "eggs")?.unit).toBe("egg");
  });

  it("generates shopping list suggestions", () => {
    const list = generateShoppingList(["ord-chika", "ord-tolu"]);
    expect(list.find((item) => item.ingredientName === "Dark Chocolate")).toBeTruthy();
    expect(list.find((item) => item.ingredientName === "Eggs")).toBeTruthy();
  });
});
