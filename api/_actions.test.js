import { describe, expect, it } from "vitest";
import { planBatchDeductions, productionShortageForRequirement } from "./_actions.js";

describe("FEFO batch deduction planning", () => {
  it("deducts stock removals across lots in the provided FEFO order", () => {
    expect(planBatchDeductions([
      { id: "lot-old", quantity_remaining: 100 },
      { id: "lot-new", quantity_remaining: 150 }
    ], 180)).toEqual([
      { batchId: "lot-old", quantity: 100 },
      { batchId: "lot-new", quantity: 80 }
    ]);
  });

  it("caps deductions at available lot quantity", () => {
    expect(planBatchDeductions([
      { id: "lot-a", quantity_remaining: 40 },
      { id: "lot-b", quantity_remaining: 30 }
    ], 100)).toEqual([
      { batchId: "lot-a", quantity: 40 },
      { batchId: "lot-b", quantity: 30 }
    ]);
  });
});

describe("production shortage guardrails", () => {
  it("flags a production shortage when usable stock is below the requirement", () => {
    expect(productionShortageForRequirement(
      { ingredient_id: "flour", unit: "g", quantity: 500 },
      { name: "Flour", current_stock: 320, reserved_stock: 0 },
      0
    )).toMatchObject({
      ingredientId: "flour",
      ingredientName: "Flour",
      unit: "g",
      requiredQuantity: 500,
      availableQuantity: 320,
      shortageQuantity: 180
    });
  });

  it("allows stock already reserved for the same order to be consumed", () => {
    expect(productionShortageForRequirement(
      { ingredient_id: "flour", unit: "g", quantity: 500 },
      { name: "Flour", current_stock: 500, reserved_stock: 500 },
      500
    )).toBeNull();
  });

  it("treats stock reserved for other orders as unavailable", () => {
    expect(productionShortageForRequirement(
      { ingredient_id: "flour", unit: "g", quantity: 500 },
      { name: "Flour", current_stock: 500, reserved_stock: 300 },
      0
    )).toMatchObject({
      availableQuantity: 200,
      shortageQuantity: 300
    });
  });
});
