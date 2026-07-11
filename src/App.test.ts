import { beforeEach, describe, expect, it } from "vitest";
import { resolveSessionPage } from "./App";
import { recipes as kitchenRecipes, setKitchenSnapshot } from "./data";
import { auditChangeSummary, auditDataJson, auditExportRows, auditRecordLabel, auditSearchText } from "./lib/audit";
import { buildKitchenAssistantResponse, calculateMargin, calculateRecipeCost, cancellationConsequences, checkStockAvailability, computeOrderPricing, convertUnit, dashboardProductionQueue, formatNaira, formatQuantity, formatScaledIngredientQuantity, generateShoppingList, netSellingPrice, orderEventLabel, orderEventsForOrder, ordersForProductionBucket, parseRecipeText, productionPeriodBounds, recommendedRestockDate, restockSuggestions, roundScaledQuantity, scaleRecipe, stockAdjustmentValidation } from "./lib/kitchen";
import { activeSelectedIdsForRoute, parseAppRoute, routeBackLabel, routeParent, serializeAppRoute } from "./lib/routes";
import { practicalQuantity, roundGrams, validateNonNegativeNumber, validatePositiveNumber } from "../shared/policy.js";
import type { AuditLog, ConversionRule, Ingredient, Recipe, RecipeItem } from "./types";

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
        { id: "egg-whites", name: "Egg Whites", category: "Dairy", baseUnit: "g", currentStock: 0, reorderLevel: 0, latestUnitCost: 2.4, supplierId: "sup-market" },
        { id: "coconut-oil", name: "Coconut Oil", category: "Dairy", baseUnit: "ml", currentStock: 3000, reorderLevel: 1000, latestUnitCost: 2.8, supplierId: "sup-market" },
        { id: "lemon", name: "Lemon", category: "Fruits", baseUnit: "pcs", currentStock: 20, reorderLevel: 12, latestUnitCost: 120, supplierId: "sup-market" },
        { id: "blueberries", name: "Blueberries", category: "Fruits", baseUnit: "g", currentStock: 300, reorderLevel: 500, latestUnitCost: 9.5, supplierId: "sup-market" }
      ],
      products: [
        { id: "classic-brownies", name: "Classic Brownies", category: "Brownies", description: "", active: true },
        { id: "lemon-blueberry-loaf", name: "Lemon Blueberry Loaf", category: "Loaves", description: "", active: true },
        { id: "cup-test-cake", name: "Cup Test Cake", category: "Cakes", description: "", active: true },
        { id: "source-cost-cake", name: "Source Cost Cake", category: "Cakes", description: "", active: true }
      ],
      recipes: [
        { id: "recipe-classic", productId: "classic-brownies", name: "Classic Brownies", category: "Brownies", baseYieldQuantity: 16, yieldUnit: "pieces", instructions: [], active: true, updatedAt: "2026-05-18" },
        { id: "recipe-lemon", productId: "lemon-blueberry-loaf", name: "Lemon Blueberry Loaf", category: "Loaves", baseYieldQuantity: 1, yieldUnit: "loaf", instructions: [], active: true, updatedAt: "2026-05-18" },
        { id: "recipe-cup-test", productId: "cup-test-cake", name: "Cup Test Cake", category: "Cakes", baseYieldQuantity: 1, yieldUnit: "cake", instructions: [], active: true, updatedAt: "2026-05-18" },
        { id: "recipe-source-cost-test", productId: "source-cost-cake", name: "Source Cost Cake", category: "Cakes", baseYieldQuantity: 1, yieldUnit: "cake", instructions: [], active: true, updatedAt: "2026-05-18" }
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
        { id: "ri-cup-test", recipeId: "recipe-cup-test", ingredientId: "flour", quantity: 2, unit: "cup" },
        { id: "ri-source-cost-test", recipeId: "recipe-source-cost-test", ingredientId: "flour", quantity: 100, unit: "g", prepState: { sourceLineAmount: 250 } }
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
        { id: "cr-sugar", ingredientId: "sugar", fromUnit: "cup", toUnit: "g", conversionFactor: 200, conversionType: "ingredient_specific", confidenceLevel: "High", source: "seed rule", verified: true, updatedAt: "2026-05-18" },
        { id: "cr-cocoa", ingredientId: "cocoa", fromUnit: "cup", toUnit: "g", conversionFactor: 85, conversionType: "ingredient_specific", confidenceLevel: "High", source: "seed rule", verified: true, updatedAt: "2026-05-18" },
        { id: "cr-oil", ingredientId: "coconut-oil", fromUnit: "cup", toUnit: "ml", conversionFactor: 240, conversionType: "ingredient_specific", confidenceLevel: "High", source: "seed rule", verified: true, updatedAt: "2026-05-18" },
        { id: "cr-egg", ingredientId: "eggs", fromUnit: "egg", toUnit: "g", conversionFactor: 50, conversionType: "ingredient_specific", confidenceLevel: "Medium", source: "seed rule", verified: true, updatedAt: "2026-05-18" },
        { id: "cr-yolk", ingredientId: "egg-yolks", fromUnit: "yolk", toUnit: "g", conversionFactor: 18, conversionType: "ingredient_specific", confidenceLevel: "Medium", source: "seed rule", verified: true, updatedAt: "2026-05-18" },
        { id: "cr-white", ingredientId: "egg-whites", fromUnit: "white", toUnit: "g", conversionFactor: 30, conversionType: "ingredient_specific", confidenceLevel: "Medium", source: "seed rule", verified: true, updatedAt: "2026-05-18" }
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

  it("rejects non-positive or non-finite scaling yields instead of emitting NaN/Infinity/negative (PCO-006)", () => {
    expect(() => scaleRecipe("recipe-classic", 0)).toThrow(/greater than zero/);
    expect(() => scaleRecipe("recipe-classic", -12)).toThrow(/greater than zero/);
    expect(() => scaleRecipe("recipe-classic", Number.NaN)).toThrow(/must be a number/);
    expect(() => scaleRecipe("recipe-classic", Number.POSITIVE_INFINITY)).toThrow(/must be a number/);
  });

  it("uses consistent quantity rounding for audit scaling cases", () => {
    expect(roundScaledQuantity(187.5, "g")).toBe(187.5);
    expect(roundScaledQuantity(187.54, "g")).toBe(187.5);
    expect(roundScaledQuantity(2.25, "pcs")).toBe(3);
    expect(scaleRecipe("recipe-classic", 8).find((item) => item.ingredientName === "Dark Chocolate")?.scaledQuantity).toBe(125);
    expect(scaleRecipe("recipe-classic", 24).find((item) => item.ingredientName === "Dark Chocolate")?.scaledQuantity).toBe(375);
  });

  it("honors egg scaling settings for count and gram-weight production formulas", () => {
    const recipeList: Recipe[] = [{ id: "recipe-half-egg", productId: "prod-half-egg", name: "Half Egg Test", category: "Brownies", baseYieldQuantity: 4, yieldUnit: "pieces", instructions: [], active: true, updatedAt: "2026-06-23" }];
    const itemList: RecipeItem[] = [{ id: "ri-half-egg", recipeId: "recipe-half-egg", ingredientId: "eggs", quantity: 1, unit: "pcs", prepState: { ingredientState: "Lightly beaten", temperatureState: "Room temperature" } }];
    const ingredientList: Ingredient[] = [{ id: "eggs", name: "Eggs", category: "Dairy", baseUnit: "pcs", currentStock: 10, reorderLevel: 2, latestUnitCost: 160 }];

    const nearest = scaleRecipe("recipe-half-egg", 2, recipeList, itemList, ingredientList, { eggRoundingPreference: "nearest_whole_egg" })[0];
    expect(nearest.scaledQuantity).toBe(1);
    expect(nearest.displayQuantity).toBeUndefined();
    expect(formatScaledIngredientQuantity(nearest)).toBe("1pcs");

    const gramMode = scaleRecipe("recipe-half-egg", 2, recipeList, itemList, ingredientList, { eggRoundingPreference: "allow_gram_conversion" })[0];
    expect(gramMode.scaledQuantity).toBe(0.5);
    expect(gramMode.displayQuantity).toBe(25);
    expect(gramMode.displayUnit).toBe("g");
    expect(gramMode.prepState).toMatchObject({ ingredientState: "Lightly beaten", temperatureState: "Room temperature" });
    expect(formatScaledIngredientQuantity(gramMode)).toBe("25g");
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

  it("prefers scoped conversion rules when recipe prep state matches", () => {
    const rules: ConversionRule[] = [
      { id: "generic-flour", ingredientId: "flour", fromUnit: "cup", toUnit: "g", conversionFactor: 120, conversionType: "ingredient_specific", confidenceLevel: "High", source: "seed rule", verified: true, updatedAt: "2026-06-23" },
      { id: "sifted-flour", ingredientId: "flour", fromUnit: "cup", toUnit: "g", conversionFactor: 112, conversionType: "ingredient_specific", confidenceLevel: "High", source: "measured in kitchen", verified: true, ingredientState: "Sifted", formulaContext: "Brownie", updatedAt: "2026-06-23" }
    ];

    expect(convertUnit(1, "cup", "g", "flour", rules).convertedQuantity).toBe(120);
    expect(convertUnit(1, "cup", "g", "flour", rules, { ingredientState: "Sifted", formulaContext: "Brownie" }).convertedQuantity).toBe(112);
  });

  it("reuses saved conversion rules when costing recipe ingredients", () => {
    const cost = calculateRecipeCost("recipe-cup-test", 1);
    expect(cost.ingredientCostBreakdown[0]).toMatchObject({ ingredientName: "Flour", scaledQuantity: 240, unit: "g" });
    expect(cost.totalRecipeCost).toBeCloseTo(120);
  });

  it("uses approved source line amounts when present on imported recipe items", () => {
    const cost = calculateRecipeCost("recipe-source-cost-test", 2);
    expect(cost.ingredientCostBreakdown[0]).toMatchObject({ ingredientName: "Flour", cost: 500 });
    expect(cost.totalRecipeCost).toBeCloseTo(500);
  });

  it("adds labor, packaging, overhead, failure allowance, and yield-loss basis to recipe costing", () => {
    const recipe = kitchenRecipes.find((item) => item.id === "recipe-classic");
    if (!recipe) throw new Error("recipe-classic fixture missing");
    recipe.costProfile = {
      laborMinutes: 60,
      laborRatePerHour: 1200,
      packagingCost: 1600,
      overheadCost: 0,
      utilityCost: 0,
      failureAllowancePercentage: 10,
      yieldLossPercentage: 5
    };

    const cost = calculateRecipeCost("recipe-classic", 12);
    expect(cost.ingredientSubtotal).toBeCloseTo(3043.5);
    expect(cost.nonIngredientCost).toBeCloseTo(2614.35);
    expect(cost.totalRecipeCost).toBeCloseTo(5657.85);
    expect(cost.effectiveYieldQuantity).toBeCloseTo(11.4);
    expect(cost.costPerYieldUnit).toBeCloseTo(496.3026, 3);
  });

  it("parses plural recipe units and count ingredients", () => {
    const parsed = parseRecipeText("2 cups flour\n4 eggs");
    expect(parsed.find((item) => item.ingredientName === "flour")?.convertedQuantity).toBe(240);
    expect(parsed.find((item) => item.ingredientName === "eggs")?.unit).toBe("egg");
  });

  it("parses natural conversion questions for audit ingredients", () => {
    const parsed = parseRecipeText([
      "Convert 4 cups flour to grams.",
      "Convert 1 cup sugar to grams.",
      "Convert 1 cup cocoa powder to grams.",
      "Convert 4 large eggs to grams.",
      "Convert 3 egg yolks to grams",
      "Convert 2 egg whites to grams",
      "Convert 1 cup coconut oil to ml."
    ].join("\n"));

    expect(parsed.map((item) => [item.ingredientId, item.convertedQuantity, item.convertedUnit, item.needsReview])).toEqual([
      ["flour", 480, "g", false],
      ["sugar", 200, "g", false],
      ["cocoa", 85, "g", false],
      ["eggs", 200, "g", false],
      ["egg-yolks", 54, "g", false],
      ["egg-whites", 60, "g", false],
      ["coconut-oil", 240, "ml", false]
    ]);
  });

  it("generates shopping list suggestions", () => {
    const list = generateShoppingList(["ord-chika", "ord-tolu"]);
    expect(list.find((item) => item.ingredientName === "Dark Chocolate")).toBeTruthy();
    expect(list.find((item) => item.ingredientName === "Eggs")).toBeTruthy();
  });

  it("keeps stale orders out of today's dashboard production queue", () => {
    const queue = dashboardProductionQueue("2026-06-22");
    expect(queue.today).toEqual([]);
    expect(queue.overdue.map((card) => [card.id, card.dueDate])).toEqual([
      ["ord-tolu", "Due 2026-05-19"],
      ["ord-chika", "Due 2026-05-18"]
    ]);
  });

  it("answers AI shopping questions from the live kitchen snapshot", () => {
    const response = buildKitchenAssistantResponse("What do I need to buy?");
    expect(response).toContain("current buying priority");
    expect(response).toContain("Dark Chocolate");
    expect(response).toContain("Total suggested spend");
  });

  it("answers AI production blocker questions with shortage details", () => {
    const response = buildKitchenAssistantResponse("Which orders are blocked by shortages?");
    expect(response).toContain("Production blockers found");
    expect(response).toContain("Tolu");
    expect(response).toContain("Blueberries short 500g");
  });

  it("answers AI costing questions with real cost and no fabricated selling price (PCO-002)", () => {
    const response = buildKitchenAssistantResponse("Estimate Classic Brownies cost");
    expect(response).toContain("Classic Brownies currently costs");
    // The assistant must not invent a selling price or margin.
    expect(response).toContain("selling price");
    expect(response).not.toContain("₦18,000");
    expect(response).not.toMatch(/estimated gross margin is/);
    expect(netSellingPrice(18000)).toBe(18000);
  });

  it("answers AI conversion prompts with parsed recipe measurements", () => {
    const response = buildKitchenAssistantResponse("2 cups flour");
    expect(response).toContain("I parsed these recipe lines");
    expect(response).toContain("flour: 2 cup -> 240g (High)");
  });

  it("answers natural AI conversion questions without falling back to direct grams", () => {
    const response = buildKitchenAssistantResponse("Convert 4 large eggs to grams.");
    expect(response).toContain("Eggs: 4 egg -> 200g (Medium)");
    expect(response).not.toContain("1 g -> 1g");
  });

  it("answers exact audit AI conversion prompts with verified conversion rules", () => {
    const response = buildKitchenAssistantResponse([
      "Convert 4 cups flour to grams.",
      "Convert 1 cup sugar to grams.",
      "Convert 1 cup cocoa powder to grams.",
      "Convert 4 large eggs to grams.",
      "Convert 1 cup coconut oil to ml."
    ].join("\n"));

    expect(response).toContain("Flour: 4 cup -> 480g (High)");
    expect(response).toContain("Sugar: 1 cup -> 200g (High)");
    expect(response).toContain("Cocoa Powder: 1 cup -> 85g (High)");
    expect(response).toContain("Eggs: 4 egg -> 200g (Medium)");
    expect(response).toContain("Coconut Oil: 1 cup -> 240ml (High)");
    expect(response).not.toContain("1 g -> 1g");
  });

  it("answers AI low-stock questions from current inventory", () => {
    const response = buildKitchenAssistantResponse("Show low stock items");
    expect(response).toContain("Low-stock items right now");
    expect(response).toContain("Dark Chocolate");
    expect(response).toContain("Blueberries");
  });

  it("requires explicit confirmation for destructive stock removals", () => {
    expect(stockAdjustmentValidation({ direction: "remove", quantity: 0, currentStock: 500, unit: "g", removalConfirmed: false })).toBe("Enter an adjustment quantity greater than zero.");
    expect(stockAdjustmentValidation({ direction: "remove", quantity: 600, currentStock: 500, unit: "g", removalConfirmed: true })).toBe("Cannot remove more than available stock (500g).");
    expect(stockAdjustmentValidation({ direction: "remove", quantity: 200, currentStock: 500, unit: "g", removalConfirmed: false })).toBe("Confirm this stock removal before saving.");
    expect(stockAdjustmentValidation({ direction: "remove", quantity: 200, currentStock: 500, unit: "g", removalConfirmed: true })).toBe("");
    expect(stockAdjustmentValidation({ direction: "add", quantity: 200, currentStock: 500, unit: "g" })).toBe("");
  });
});

describe("route hash resolution", () => {
  const user = {
    id: "owner",
    email: "owner@pastrycounty.ng",
    fullName: "Owner",
    role: "Owner/Admin" as const,
    token: "signed-session"
  };

  it("falls back safely for unknown hashes instead of preserving stale private pages", () => {
    expect(resolveSessionPage("#unknown-route", { user, page: "production" })).toBe("dashboard");
    expect(resolveSessionPage("", { user, page: "production" })).toBe("production");
    expect(resolveSessionPage("#shopping", { user, page: "production" })).toBe("shopping");
    expect(resolveSessionPage("#unknown-route", { page: "login" })).toBe("login");
  });

  it("parses and serializes durable record routes", () => {
    expect(parseAppRoute("#recipes/recipe-classic")).toEqual({ name: "recipes", recipeId: "recipe-classic", mode: "detail" });
    expect(parseAppRoute("#recipes/recipe-classic/edit")).toEqual({ name: "recipes", recipeId: "recipe-classic", mode: "edit" });
    expect(parseAppRoute("#recipes/recipe-classic/scale")).toEqual({ name: "recipes", recipeId: "recipe-classic", mode: "scale" });
    expect(parseAppRoute("#inventory/flour/edit")).toEqual({ name: "inventory", ingredientId: "flour", mode: "edit" });
    expect(parseAppRoute("#orders/ord-chika")).toEqual({ name: "orders", orderId: "ord-chika", mode: "detail" });
    expect(parseAppRoute("#imports")).toEqual({ name: "imports", mode: "start", returnTo: undefined });
    expect(parseAppRoute("#imports/review?returnTo=recipes")).toEqual({ name: "imports", mode: "review", returnTo: { name: "recipes" } });
    expect(serializeAppRoute({ name: "orders", orderId: "ord-chika", mode: "edit" })).toBe("#orders/ord-chika/edit");
    expect(serializeAppRoute({ name: "imports", mode: "review", returnTo: { name: "recipes" } })).toBe("#imports/review?returnTo=recipes");
  });

  it("keeps legacy hashes compatible with saved selected IDs", () => {
    expect(parseAppRoute("#recipe-detail", { selectedRecipeId: "recipe-classic" })).toEqual({ name: "recipes", recipeId: "recipe-classic", mode: "detail" });
    expect(parseAppRoute("#recipe-form", { selectedRecipeId: "recipe-classic" })).toEqual({ name: "recipes", recipeId: "recipe-classic", mode: "edit" });
    expect(parseAppRoute("#ingredient-form")).toEqual({ name: "inventory", mode: "new" });
    expect(parseAppRoute("#order-create", { selectedOrderId: "ord-chika" })).toEqual({ name: "orders", orderId: "ord-chika", mode: "edit" });
  });

  it("preserves return context for cross-feature routes", () => {
    const shoppingRoute = parseAppRoute("#shopping?returnTo=production");
    expect(shoppingRoute).toEqual({ name: "shopping", returnTo: { name: "production" } });
    expect(serializeAppRoute({ name: "shopping", returnTo: { name: "production", orderId: "ord-chika" } })).toBe("#shopping?returnTo=production%2Ford-chika");
    expect(routeParent({ name: "orders", orderId: "ord-chika", mode: "detail", returnTo: { name: "production", orderId: "ord-chika" } })).toEqual({ name: "production", orderId: "ord-chika" });
    expect(routeParent({ name: "imports", mode: "review", returnTo: { name: "recipes" } })).toEqual({ name: "recipes" });
    expect(routeBackLabel({ name: "recipes", recipeId: "recipe-classic", mode: "edit" })).toBe("Back to Recipe Detail");
  });

  it("does not reuse stale selected IDs for new-record routes", () => {
    expect(activeSelectedIdsForRoute({ name: "recipes", mode: "new" }, { selectedRecipeId: "recipe-classic" }).selectedRecipeId).toBe("");
    expect(activeSelectedIdsForRoute({ name: "inventory", mode: "new" }, { selectedIngredientId: "flour" }).selectedIngredientId).toBe("");
    expect(activeSelectedIdsForRoute({ name: "orders", mode: "new" }, { selectedOrderId: "ord-chika" }).selectedOrderId).toBe("");
    expect(activeSelectedIdsForRoute({ name: "recipes", recipeId: "recipe-classic", mode: "edit" }, { selectedRecipeId: "recipe-other" }).selectedRecipeId).toBe("recipe-classic");
  });
});

describe("audit report export helpers", () => {
  const entry: AuditLog = {
    id: "audit-1",
    entityType: "ingredients",
    entityId: "flour",
    action: "update",
    actor: "owner@pastrycounty.com",
    createdAt: "2026-06-13T12:00:00.000Z",
    beforeData: { name: "Flour", latest_unit_cost: 1, password_hash: "secret-before" },
    afterData: { name: "Flour", latest_unit_cost: 0.5, password_hash: "secret-after", sessionToken: "abc123" }
  };

  it("summarizes changed audit fields without exposing sensitive keys", () => {
    expect(auditChangeSummary(entry)).toBe("latest unit cost");
    expect(auditRecordLabel(entry)).toBe("Flour (flour)");
    expect(auditSearchText(entry)).toContain("Flour");
    expect(auditSearchText(entry)).toContain("latest unit cost");
    expect(auditSearchText(entry)).not.toContain("secret-after");
  });

  it("redacts sensitive before and after values in detailed audit export rows", () => {
    const json = auditDataJson(entry.afterData);
    expect(json).toContain('"latest_unit_cost": 0.5');
    expect(json).toContain('"sessionToken": "[redacted]"');
    expect(json).not.toContain("abc123");

    const [row] = auditExportRows([entry]);
    expect(row[0]).toBe("ingredients");
    expect(row[1]).toBe("Flour (flour)");
    expect(row[5]).toBe("latest unit cost");
    expect(String(row[6])).toContain('"password_hash": "[redacted]"');
    expect(String(row[7])).toContain('"sessionToken": "[redacted]"');
  });

  it("searches and exports audit records by safe display names", () => {
    const createEntry: AuditLog = {
      id: "audit-created",
      entityType: "ingredients",
      entityId: "ingredient-audit-flour",
      action: "create",
      actor: "owner@pastrycounty.com",
      createdAt: "2026-06-22T12:00:00.000Z",
      afterData: { name: "AUDIT-Flour", password_hash: "hidden" }
    };
    const purchaseEntry: AuditLog = {
      id: "audit-purchase",
      entityType: "ingredients",
      entityId: "ingredient-audit-flour",
      action: "purchase",
      actor: "owner@pastrycounty.com",
      createdAt: "2026-06-22T12:05:00.000Z",
      afterData: { purchaseId: "purchase-1", quantity: 1, unit: "g", sessionToken: "hidden" }
    };
    const lookup = { ingredients: { "ingredient-audit-flour": "AUDIT-Flour" } };

    expect(auditRecordLabel(createEntry)).toBe("AUDIT-Flour (ingredient-audit-flour)");
    expect(auditSearchText(createEntry).toLowerCase()).toContain("audit-flour");
    expect(auditSearchText(purchaseEntry, lookup).toLowerCase()).toContain("audit-flour");
    expect(auditExportRows([purchaseEntry], lookup)[0][1]).toBe("AUDIT-Flour (ingredient-audit-flour)");
    expect(auditSearchText(purchaseEntry, lookup)).not.toContain("hidden");
  });
});

describe("shared policy validation and rounding (PCO-006/007)", () => {
  it("validates positive numbers with field-level errors", () => {
    expect(validatePositiveNumber(12, "Yield")).toBeNull();
    expect(validatePositiveNumber(0, "Yield")).toMatch(/greater than zero/);
    expect(validatePositiveNumber(-3, "Yield")).toMatch(/greater than zero/);
    expect(validatePositiveNumber("", "Yield")).toMatch(/must be a number/);
    expect(validatePositiveNumber("abc", "Yield")).toMatch(/must be a number/);
    expect(validatePositiveNumber(Number.POSITIVE_INFINITY, "Yield")).toMatch(/must be a number/);
  });

  it("validates non-negative numbers", () => {
    expect(validateNonNegativeNumber(0, "Stock")).toBeNull();
    expect(validateNonNegativeNumber(5, "Stock")).toBeNull();
    expect(validateNonNegativeNumber(-1, "Stock")).toMatch(/cannot be negative/);
    expect(validateNonNegativeNumber("x", "Stock")).toMatch(/must be a number/);
  });

  it("rounds grams to the configured 1/5/10g step", () => {
    expect(roundGrams(187.5, 1)).toBe(188);
    expect(roundGrams(187.5, 5)).toBe(190);
    expect(roundGrams(187.5, 10)).toBe(190);
    expect(roundGrams(183, 10)).toBe(180);
  });

  it("produces practical quantities per unit (count up, grams stepped, other one decimal)", () => {
    expect(practicalQuantity(2.1, "pcs", 5)).toBe(3);
    expect(practicalQuantity(187.5, "g", 5)).toBe(190);
    expect(practicalQuantity(135.44, "ml", 5)).toBe(135.4);
  });
});

describe("cancellation consequences (PCO-009)", () => {
  const reservationMovements = [
    { id: "m1", ingredientId: "flour", movementType: "reservation", quantityChange: 500, unit: "g", relatedOrderId: "ord-1", note: "", createdBy: "x", createdAt: "" },
    { id: "m2", ingredientId: "flour", movementType: "reservation_release", quantityChange: -200, unit: "g", relatedOrderId: "ord-1", note: "", createdBy: "x", createdAt: "" }
  ];
  const orderWith = (status: string) => ({ id: "ord-1", customerName: "C", customerPhone: "", dueDate: "2026-07-15", deliveryMethod: "Pickup", status, paymentStatus: "Unpaid", productionStatus: "Not Started", stockStatus: "Reserved" });

  it("allows cancellation before production completes and flags the net reservation release", () => {
    const consequences = cancellationConsequences(orderWith("Stock Reserved") as never, reservationMovements as never);
    expect(consequences.canCancel).toBe(true);
    expect(consequences.willReleaseReservation).toBe(true);
    expect(consequences.alreadyDeducted).toBe(false);
    expect(consequences.productionStarted).toBe(false);
  });

  it("flags production started for an In Production order", () => {
    const consequences = cancellationConsequences(orderWith("In Production") as never, reservationMovements as never);
    expect(consequences.canCancel).toBe(true);
    expect(consequences.productionStarted).toBe(true);
  });

  it("blocks cancellation once stock has been deducted at production and explains why", () => {
    const consequences = cancellationConsequences(orderWith("Produced") as never, []);
    expect(consequences.canCancel).toBe(false);
    expect(consequences.alreadyDeducted).toBe(true);
    expect(consequences.blockedReason).toMatch(/correction/i);
  });

  it("blocks a delivered or already-cancelled order", () => {
    expect(cancellationConsequences(orderWith("Delivered") as never, []).canCancel).toBe(false);
    expect(cancellationConsequences(orderWith("Cancelled") as never, []).canCancel).toBe(false);
  });

  it("reports no reservation to release once releases offset the reservations", () => {
    const fullyReleased = [
      reservationMovements[0],
      { id: "m3", ingredientId: "flour", movementType: "reservation_release", quantityChange: -500, unit: "g", relatedOrderId: "ord-1", note: "", createdBy: "x", createdAt: "" }
    ];
    expect(cancellationConsequences(orderWith("Confirmed") as never, fullyReleased as never).willReleaseReservation).toBe(false);
  });
});

describe("production queue eligibility (PCO-004)", () => {
  // 2026-07-15 is a Wednesday; its Monday-week is 2026-07-13 .. 2026-07-20 (exclusive).
  const today = "2026-07-15";
  const sampleOrders = [
    { id: "o-today", status: "Confirmed", dueDate: "2026-07-15" },
    { id: "o-tomorrow", status: "Stock Reserved", dueDate: "2026-07-16" },
    { id: "o-thisweek", status: "In Production", dueDate: "2026-07-17" },
    { id: "o-overdue-thisweek", status: "Confirmed", dueDate: "2026-07-13" },
    { id: "o-nextweek", status: "Confirmed", dueDate: "2026-07-21" },
    { id: "o-delivered", status: "Delivered", dueDate: "2026-07-15" },
    { id: "o-cancelled", status: "Cancelled", dueDate: "2026-07-15" },
    { id: "o-produced", status: "Produced", dueDate: "2026-07-15" },
    { id: "o-draft", status: "Draft", dueDate: "2026-07-15" }
  ];
  const bucketIds = (bucket: "Today" | "Tomorrow" | "This Week") =>
    ordersForProductionBucket(bucket, today, sampleOrders as never).map((order) => order.id);

  it("computes explicit Monday-week period bounds", () => {
    expect(productionPeriodBounds("today", today)).toEqual({ start: "2026-07-15", end: "2026-07-16" });
    expect(productionPeriodBounds("tomorrow", today)).toEqual({ start: "2026-07-16", end: "2026-07-17" });
    expect(productionPeriodBounds("week", today)).toEqual({ start: "2026-07-13", end: "2026-07-20" });
  });

  it("handles month and year boundaries", () => {
    // 2026-01-01 is a Thursday; its Monday-week starts 2025-12-29.
    expect(productionPeriodBounds("week", "2026-01-01")).toEqual({ start: "2025-12-29", end: "2026-01-05" });
  });

  it("Today and Tomorrow show only producible orders due that day", () => {
    expect(bucketIds("Today")).toEqual(["o-today"]);
    expect(bucketIds("Tomorrow")).toEqual(["o-tomorrow"]);
  });

  it("This Week covers the rest of the week (incl. earlier-this-week) but not today/tomorrow or next week", () => {
    const week = bucketIds("This Week");
    expect(week).toContain("o-thisweek");
    expect(week).toContain("o-overdue-thisweek");
    expect(week).not.toContain("o-today");
    expect(week).not.toContain("o-tomorrow");
    expect(week).not.toContain("o-nextweek");
  });

  it("never shows delivered, cancelled, produced, or draft orders in any bucket", () => {
    const all = (["Today", "Tomorrow", "This Week"] as const).flatMap(bucketIds);
    for (const hidden of ["o-delivered", "o-cancelled", "o-produced", "o-draft"]) {
      expect(all).not.toContain(hidden);
    }
  });

  it("no longer matches every order the way the old This Week short-circuit did", () => {
    const all = new Set((["Today", "Tomorrow", "This Week"] as const).flatMap(bucketIds));
    expect(all.size).toBeLessThan(sampleOrders.length);
  });
});

describe("restock guidance (PCO-014)", () => {
  it("computes a grounded recommended order-by date from due date and lead time", () => {
    expect(recommendedRestockDate("2026-07-11", undefined, 2)).toBe("2026-07-11");
    expect(recommendedRestockDate("2026-07-11", "2026-07-20", 3)).toBe("2026-07-17");
    expect(recommendedRestockDate("2026-07-11", "2026-07-12", 5)).toBe("2026-07-11");
  });

  it("derives suggestions only for ingredients below reorder level, with provenance", () => {
    setKitchenSnapshot({
      suppliers: [{ id: "sup-1", name: "Market", contactName: "", phone: "", email: "", address: "", defaultCurrency: "NGN", leadTimeDays: 4, notes: "" }],
      ingredients: [
        { id: "choc", name: "Dark Chocolate", category: "Chocolate", baseUnit: "g", currentStock: 200, reorderLevel: 1000, latestUnitCost: 8, supplierId: "sup-1" },
        { id: "flour", name: "Flour", category: "Dry Goods", baseUnit: "g", currentStock: 9000, reorderLevel: 3000, latestUnitCost: 0.5, supplierId: "sup-1" }
      ],
      products: [], recipes: [], recipeItems: [], orders: [], orderItems: [], inventoryMovements: [], conversionRules: [],
      settings: { businessName: "PC", currency: "NGN", defaultDeductionStage: "production_completion", allowNegativeInventory: false, requireAiConversionConfirmation: true, gramRoundingPreference: 5, eggRoundingPreference: "nearest_whole_egg" }
    });
    const suggestions = restockSuggestions("2026-07-11");
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      ingredientId: "choc",
      currentStock: 200,
      reorderLevel: 1000,
      shortfall: 800,
      leadTimeDays: 4,
      relevantOrderCount: 0,
      recommendedOrderByDate: "2026-07-11"
    });
    expect(suggestions[0].reason).toContain("Below reorder level");
  });
});

describe("order pricing preview mirror (PCO-002)", () => {
  it("matches the authoritative API contract on identical inputs", () => {
    const pricing = computeOrderPricing({ lines: [{ saleQuantity: 1, unitSellingPrice: 10000 }], taxRate: 7.5, deliveryFee: 1500 });
    expect(pricing.netTotal).toBe(10000);
    expect(pricing.taxAmount).toBe(750);
    expect(pricing.grossTotal).toBe(12250);
    expect(pricing.hasPricing).toBe(true);
  });

  it("distinguishes different order prices instead of a fixed value", () => {
    expect(computeOrderPricing({ lines: [{ saleQuantity: 1, unitSellingPrice: 7500 }] }).netTotal).toBe(7500);
    expect(computeOrderPricing({ lines: [{ saleQuantity: 1, unitSellingPrice: 40000 }] }).netTotal).toBe(40000);
  });

  it("clamps invalid preview inputs to zero instead of throwing", () => {
    const pricing = computeOrderPricing({ lines: [{ saleQuantity: 1, unitSellingPrice: -5 }] });
    expect(pricing.hasPricing).toBe(false);
    expect(pricing.netTotal).toBe(0);
  });
});

describe("order event timeline (PCO-001)", () => {
  const events = [
    { id: "e1", orderId: "ord-a", eventType: "created", actorName: "Ada Baker", newStatus: "Confirmed", createdAt: "2026-07-10T09:00:00.000Z" },
    { id: "e3", orderId: "ord-a", eventType: "produced", actorName: "Ada Baker", newStatus: "Produced", createdAt: "2026-07-10T11:00:00.000Z" },
    { id: "e2", orderId: "ord-a", eventType: "reserved", actorName: "Sam Stock", newStatus: "Stock Reserved", createdAt: "2026-07-10T10:00:00.000Z" },
    { id: "e4", orderId: "ord-b", eventType: "created", actorName: "Ada Baker", newStatus: "Confirmed", createdAt: "2026-07-10T09:30:00.000Z" }
  ];

  it("returns only the selected order's events in chronological order", () => {
    const timeline = orderEventsForOrder(events, "ord-a");
    expect(timeline.map((event) => event.id)).toEqual(["e1", "e2", "e3"]);
    expect(timeline.every((event) => event.orderId === "ord-a")).toBe(true);
  });

  it("never leaks another order's events (isolation)", () => {
    expect(orderEventsForOrder(events, "ord-b").map((event) => event.id)).toEqual(["e4"]);
    expect(orderEventsForOrder(events, "ord-a").some((event) => event.id === "e4")).toBe(false);
  });

  it("returns an empty timeline for an order with no events (honest legacy/empty state)", () => {
    expect(orderEventsForOrder(events, "ord-missing")).toEqual([]);
  });

  it("preserves the real actor for each event rather than a fabricated one", () => {
    const timeline = orderEventsForOrder(events, "ord-a");
    expect(timeline.map((event) => event.actorName)).toEqual(["Ada Baker", "Sam Stock", "Ada Baker"]);
  });

  it("labels each event type and falls back to the status for unknown types", () => {
    expect(orderEventLabel({ eventType: "created", newStatus: "Confirmed" })).toBe("Order created");
    expect(orderEventLabel({ eventType: "reserved", newStatus: "Stock Reserved" })).toBe("Stock reserved");
    expect(orderEventLabel({ eventType: "produced", newStatus: "Produced" })).toBe("Marked produced");
    expect(orderEventLabel({ eventType: "delivered", newStatus: "Delivered" })).toBe("Delivered");
    expect(orderEventLabel({ eventType: "cancelled", newStatus: "Cancelled" })).toBe("Order cancelled");
    expect(orderEventLabel({ eventType: "status_changed", newStatus: "Confirmed" })).toBe("Status changed to Confirmed");
    expect(orderEventLabel({ eventType: "mystery", newStatus: null })).toBe("Order updated");
  });
});
