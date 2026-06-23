import { describe, expect, it } from "vitest";
import { parseImportText } from "./_imports.js";

const context = {
  ingredients: [
    { id: "flour", name: "Flour", category: "Dry Goods", baseUnit: "g" },
    { id: "sugar", name: "Sugar", category: "Dry Goods", baseUnit: "g" },
    { id: "eggs", name: "Eggs", category: "Dairy", baseUnit: "pcs" }
  ],
  recipes: [
    { id: "recipe-classic", name: "Classic Brownies", category: "Brownies" }
  ],
  suppliers: [
    { id: "sup-market", name: "Market Supplier" }
  ]
};

describe("import draft parser", () => {
  it("parses pasted recipe text with source-cost evidence", () => {
    const draft = parseImportText([
      "Recipe: Launch Brownies",
      "Category: Brownies",
      "Yield: 16 pieces",
      "Ingredients:",
      "300 g flour | package quantity: 1000 | package price: 900 | line amount: 270",
      "500 g sugar | amount: 310",
      "4 pcs eggs",
      "Instructions:",
      "Mix batter gently.",
      "Bake until set."
    ].join("\n"), { name: "photo-transcript.txt", type: "text" }, context);

    expect(draft.counts.recipes).toBe(1);
    expect(draft.recipes[0]).toMatchObject({
      name: "Launch Brownies",
      category: "Brownies",
      baseYieldQuantity: 16,
      yieldUnit: "pieces",
      confidence: "High"
    });
    expect(draft.recipes[0].instructions).toEqual(["Mix batter gently.", "Bake until set."]);
    expect(draft.recipes[0].items[0]).toMatchObject({
      ingredientId: "flour",
      quantity: 300,
      unit: "g",
      needsReview: false,
      prepState: {
        sourceFile: "photo-transcript.txt",
        sourceLineName: "flour",
        sourcePackageQuantity: 1000,
        sourcePackagePrice: 900,
        sourceLineAmount: 270
      }
    });
  });

  it("classifies mixed CSV rows into recipes, ingredients, suppliers, and conversions", () => {
    const csv = [
      "record_type,recipe,category,base_yield_quantity,yield_unit,ingredient,quantity,unit,package_quantity,package_price,line_amount,supplier,from_unit,to_unit,conversion_factor,contact,email",
      "supplier,,,,,,,,,,,New Mill,,,,Amina,orders@example.com",
      "ingredient,,,,,Butter,,g,,,1200,New Mill,,,,,",
      "recipe,Wedding Cake,Cakes,1,cake,Flour,500,g,1000,900,450,,,,,,",
      "recipe,Wedding Cake,Cakes,1,cake,Butter,250,g,500,1200,600,,,,,,",
      "conversion,,,,,Butter,,,,,,New Mill,cup,g,227,,"
    ].join("\n");

    const draft = parseImportText(csv, { name: "onboarding.csv", type: "csv", extension: "csv" }, context);

    expect(draft.counts).toMatchObject({
      recipes: 1,
      ingredients: 1,
      suppliers: 1,
      conversionRules: 1
    });
    expect(draft.suppliers[0]).toMatchObject({ name: "New Mill", contactName: "Amina", email: "orders@example.com" });
    expect(draft.ingredients[0]).toMatchObject({ name: "Butter", supplierName: "New Mill", latestUnitCost: 1200 });
    expect(draft.recipes[0].items.map((item) => [item.ingredientName, item.ingredientId, item.needsReview])).toEqual([
      ["Flour", "flour", false],
      ["Butter", undefined, true]
    ]);
    expect(draft.conversionRules[0]).toMatchObject({ ingredientName: "Butter", fromUnit: "cup", toUnit: "g", conversionFactor: 227, needsReview: true });
  });

  it("flags duplicate recipe names for review before commit", () => {
    const draft = parseImportText("Recipe: Classic Brownies\nIngredients:\n300 g flour", { name: "duplicate.txt", type: "text" }, context);
    expect(draft.recipes[0].duplicateCandidates).toEqual([{ id: "recipe-classic", name: "Classic Brownies" }]);
    expect(draft.recipes[0].reviewCount).toBeGreaterThan(0);
  });
});

