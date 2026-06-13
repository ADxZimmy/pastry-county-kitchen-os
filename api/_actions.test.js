import { describe, expect, it } from "vitest";
import { allowedRolesForAction, canRolePerformAction, normalizeShoppingPurchaseInput, planBatchDeductions, productionShortageForRequirement } from "./_actions.js";

describe("FEFO batch deduction planning", () => {
  it("deducts stock removals or production use across lots in the provided FEFO order", () => {
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

describe("API role permissions", () => {
  it("keeps Owner/Admin as the fallback role for unknown actions", () => {
    expect(allowedRolesForAction("unknown.action")).toEqual(["Owner/Admin"]);
    expect(canRolePerformAction("Owner/Admin", "unknown.action")).toBe(true);
    expect(canRolePerformAction("Baker", "unknown.action")).toBe(false);
  });

  it("allows only inventory roles to post shopping purchases", () => {
    expect(canRolePerformAction("Owner/Admin", "shopping.purchaseSuggested")).toBe(true);
    expect(canRolePerformAction("Inventory Manager", "shopping.purchaseSuggested")).toBe(true);
    expect(canRolePerformAction("Baker", "shopping.purchaseSuggested")).toBe(false);
  });

  it("keeps production batch updates limited to kitchen production roles", () => {
    expect(canRolePerformAction("Owner/Admin", "production.batchStatus")).toBe(true);
    expect(canRolePerformAction("Baker", "production.batchStatus")).toBe(true);
    expect(canRolePerformAction("Inventory Manager", "production.batchStatus")).toBe(false);
  });

  it("keeps settings and staff administration owner-only", () => {
    expect(canRolePerformAction("Owner/Admin", "settings.save")).toBe(true);
    expect(canRolePerformAction("Inventory Manager", "settings.save")).toBe(false);
    expect(canRolePerformAction("Baker", "user.save")).toBe(false);
  });
});

describe("shopping purchase validation", () => {
  const flour = { supplier_id: "supplier-1", base_unit: "g" };

  it("normalizes selected purchase quantities, cost, supplier fallback, expiry, and notes", () => {
    const purchase = normalizeShoppingPurchaseInput({
      ingredientId: "flour",
      suggestedBuyQuantity: 2500,
      unitCost: 0.64,
      unit: "g",
      expiryDate: "2026-07-01",
      note: "Restock for weekend orders"
    }, flour, 2);

    expect(purchase).toMatchObject({
      index: 2,
      ingredientId: "flour",
      supplierId: "supplier-1",
      quantity: 2500,
      unit: "g",
      purchasePrice: 1600,
      unitCost: 0.64,
      expiryDate: "2026-07-01",
      note: "Restock for weekend orders"
    });
    expect(purchase.purchaseId).toMatch(/^pur-2-/);
  });

  it("uses explicit purchase price to derive the stored unit cost", () => {
    expect(normalizeShoppingPurchaseInput({
      ingredientId: "flour",
      purchaseQuantity: 100,
      unitCost: 2,
      purchasePrice: 150
    }, flour).unitCost).toBe(1.5);
  });

  it("rejects missing ingredients and non-positive purchase fields", () => {
    expect(() => normalizeShoppingPurchaseInput({ purchaseQuantity: 10, unitCost: 1 }, flour)).toThrow("Ingredient is required.");
    expect(() => normalizeShoppingPurchaseInput({ ingredientId: "flour", purchaseQuantity: 0, unitCost: 1 }, flour)).toThrow("Purchase quantity must be greater than zero.");
    expect(() => normalizeShoppingPurchaseInput({ ingredientId: "flour", purchaseQuantity: 10, unitCost: 0 }, flour)).toThrow("Unit cost must be greater than zero.");
    expect(() => normalizeShoppingPurchaseInput({ ingredientId: "flour", purchaseQuantity: 10, unitCost: 1, purchasePrice: -4 }, flour)).toThrow("Purchase price must be greater than zero.");
    expect(() => normalizeShoppingPurchaseInput({ ingredientId: "missing", purchaseQuantity: 10, unitCost: 1 }, null)).toThrow("Ingredient not found.");
  });
});
