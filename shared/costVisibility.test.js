import { describe, expect, it } from "vitest";
import {
  COST_FIELDS,
  COST_VISIBILITY_ROLES,
  canRoleSeeCosts,
  stripCostFieldsFromRows,
  stripCostsForRole
} from "./actionPolicy.js";
import { filterKitchenSnapshotForActor } from "../api/bootstrap.js";
import { redactForAssistant } from "../api/_assistant.js";

// Phase 014 follow-up. The adversarial review found cost redaction was
// provider-only: the assistant stripped costs before sending them to a third
// party, while /api/bootstrap handed the same figures to the Viewer's own
// browser. These tests hold every consumer to ONE field list, because the whole
// point of the fix is that there is no longer a second copy to drift.

const MONEY_SNAPSHOT = {
  ingredients: [
    { id: "flour", name: "Flour", baseUnit: "g", currentStock: 1000, reorderLevel: 500, latestUnitCost: 0.9 }
  ],
  recipes: [{ id: "rec-1", name: "Brownies", baseYieldQuantity: 12, yieldUnit: "pcs", costProfile: { labour: 500 } }],
  recipeItems: [{ id: "ri-1", recipeId: "rec-1", ingredientId: "flour", quantity: 300, unit: "g" }],
  orders: [
    {
      id: "ord-1",
      customerName: "Chika",
      dueDate: "2026-08-20",
      status: "Confirmed",
      netTotal: 18000,
      grossTotal: 19000,
      balance: 9000,
      amountPaid: 9000,
      subtotal: 17000,
      taxAmount: 1000,
      taxRate: 7.5,
      deliveryFee: 500,
      discountAmount: 250
    }
  ],
  orderItems: [{ id: "oi-1", orderId: "ord-1", recipeId: "rec-1", requestedYieldQuantity: 12, unitSellingPrice: 1500, saleQuantity: 12 }],
  conversionRules: [{ id: "cr-1", ingredientId: "flour", fromUnit: "cup", toUnit: "g", conversionFactor: 120, verified: true }],
  purchaseLogs: [{ id: "pur-1", ingredientId: "flour", purchasePrice: 9000 }],
  appUsers: [],
  auditLogs: [],
  settings: { lowStockNotificationEmail: "owner@example.com" }
};

// Every money-bearing name that must not survive for a Viewer, gathered from the
// spec itself rather than typed out again — so adding a field to COST_FIELDS
// automatically extends this sweep.
const MONEY_NAMES = Object.values(COST_FIELDS).filter(Boolean).flat();

describe("who may see costs", () => {
  it("admits three roles and excludes Viewer", () => {
    expect(COST_VISIBILITY_ROLES).toEqual(["Owner/Admin", "Baker", "Inventory Manager"]);
    expect(canRoleSeeCosts("Viewer")).toBe(false);
    for (const role of COST_VISIBILITY_ROLES) expect(canRoleSeeCosts(role)).toBe(true);
  });

  it("refuses an absent, unknown or near-miss role rather than assuming the best", () => {
    for (const role of [undefined, null, "", "viewer", "OWNER/ADMIN", "Owner/Admin ", "root"]) {
      expect(canRoleSeeCosts(role), `${String(role)} must not see costs`).toBe(false);
    }
  });
});

describe("stripping the fields", () => {
  it("leaves a cost-permitted role's snapshot untouched", () => {
    expect(stripCostsForRole(MONEY_SNAPSHOT, "Baker")).toBe(MONEY_SNAPSHOT);
  });

  it("removes every money field for a Viewer and keeps the operational ones", () => {
    const stripped = stripCostsForRole(MONEY_SNAPSHOT, "Viewer");
    const serialised = JSON.stringify(stripped);
    for (const field of MONEY_NAMES) {
      expect(serialised, `${field} survived`).not.toContain(field);
    }
    // What a Viewer still needs to do their job.
    expect(stripped.ingredients[0].currentStock).toBe(1000);
    expect(stripped.orders[0].status).toBe("Confirmed");
    expect(stripped.orders[0].dueDate).toBe("2026-08-20");
    expect(stripped.recipes[0].baseYieldQuantity).toBe(12);
    expect(stripped.conversionRules[0].conversionFactor).toBe(120);
  });

  it("drops a collection that is money by definition rather than thinning it", () => {
    expect(COST_FIELDS.purchaseLogs).toBeNull();
    expect(stripCostsForRole(MONEY_SNAPSHOT, "Viewer").purchaseLogs).toEqual([]);
  });

  it("does not invent collections the snapshot never had", () => {
    const stripped = stripCostsForRole({ orders: [] }, "Viewer");
    expect(Object.keys(stripped)).toEqual(["orders"]);
  });

  it("tolerates a missing or malformed collection", () => {
    expect(stripCostFieldsFromRows("orders", undefined)).toEqual([]);
    expect(stripCostFieldsFromRows("nonexistent", [{ a: 1 }])).toEqual([{ a: 1 }]);
  });
});

describe("the bootstrap snapshot", () => {
  it("sends a Viewer no money at all", () => {
    const filtered = filterKitchenSnapshotForActor(MONEY_SNAPSHOT, { role: "Viewer" });
    const serialised = JSON.stringify(filtered);
    for (const field of MONEY_NAMES) {
      expect(serialised, `${field} reached a Viewer's browser`).not.toContain(field);
    }
  });

  it("still sends money to a Baker, who needs recipe costs", () => {
    const filtered = filterKitchenSnapshotForActor(MONEY_SNAPSHOT, { role: "Baker" });
    expect(filtered.orders[0].netTotal).toBe(18000);
    expect(filtered.ingredients[0].latestUnitCost).toBe(0.9);
  });

  it("keeps the pre-existing staff and audit blanking for every lower role", () => {
    for (const role of ["Baker", "Inventory Manager", "Viewer"]) {
      const filtered = filterKitchenSnapshotForActor(MONEY_SNAPSHOT, { role });
      expect(filtered.appUsers).toEqual([]);
      expect(filtered.auditLogs).toEqual([]);
      expect(filtered.settings.lowStockNotificationEmail).toBe("");
    }
  });

  it("leaves an Owner/Admin snapshot completely alone", () => {
    expect(filterKitchenSnapshotForActor(MONEY_SNAPSHOT, { role: "Owner/Admin" })).toBe(MONEY_SNAPSHOT);
  });
});

describe("the assistant reads the same list", () => {
  // DECISION.md's residual risk was that the allow-list and the app's projection
  // are two places that must agree. This is the test that they are now one.
  it("strips the same fields the app strips, for the same roles", () => {
    const viewer = redactForAssistant(MONEY_SNAPSHOT, "Viewer");
    const serialised = JSON.stringify(viewer);
    for (const field of MONEY_NAMES) {
      expect(serialised, `${field} reached a provider for a Viewer`).not.toContain(field);
    }
    const baker = redactForAssistant(MONEY_SNAPSHOT, "Baker");
    expect(JSON.stringify(baker)).toContain("latestUnitCost");
  });

  it("agrees with the bootstrap projection field for field", () => {
    const viaApp = filterKitchenSnapshotForActor(MONEY_SNAPSHOT, { role: "Viewer" });
    const viaAssistant = redactForAssistant(MONEY_SNAPSHOT, "Viewer");
    // The assistant's payload is a subset (it has its own allow-list on top), so
    // the claim is one-directional: nothing money-shaped may appear in the
    // assistant's payload that the app itself withheld.
    const appOrderKeys = new Set(Object.keys(viaApp.orders[0]));
    for (const key of Object.keys(viaAssistant.orders[0])) {
      if (key === "customerRef") continue; // added by redaction, not from the row
      expect(appOrderKeys.has(key), `assistant exposed ${key} that the app withheld`).toBe(true);
    }
  });
});
