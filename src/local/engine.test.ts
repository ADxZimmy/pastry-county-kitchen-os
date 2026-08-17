// Phase 016: the device-mode engine.
//
// These are the assertions that decide whether a tester's stock arithmetic can be
// trusted. The engine is pure, so every case here runs on plain objects with no
// IndexedDB and no network.
//
// The fixture is the Classic Brownies recipe the rest of the suite uses, so the
// numbers can be checked by hand against the server's own tests.
import { describe, expect, it } from "vitest";
import { requirementsForOrder, runLocalAction } from "./engine";
import { seedWorkspace } from "./seed";
import type { LocalWorkspace } from "./types";

const NOW = "2026-08-17T09:00:00.000Z";
const actor = { sub: "user-device", email: "tester@example.com", fullName: "Device Tester", role: "Owner/Admin" };

function workspace(overrides: Partial<LocalWorkspace> = {}): LocalWorkspace {
  return { ...seedWorkspace(NOW), ...overrides };
}

// A workspace with one recipe (500 g flour, 300 g sugar per 16 pieces) and stock.
function kitchen({ flour = 5000, sugar = 5000, reservedFlour = 0 } = {}): LocalWorkspace {
  const ws = workspace();
  ws.ingredients = [
    { id: "flour", name: "Flour", category: "Dry", baseUnit: "g", currentStock: flour, reservedStock: reservedFlour, reorderLevel: 500, latestUnitCost: 1, active: true, createdAt: NOW, updatedAt: NOW },
    { id: "sugar", name: "Sugar", category: "Dry", baseUnit: "g", currentStock: sugar, reservedStock: 0, reorderLevel: 500, latestUnitCost: 1, active: true, createdAt: NOW, updatedAt: NOW }
  ] as LocalWorkspace["ingredients"];
  ws.products = [{ id: "prod-brownie", name: "Classic Brownies", category: "Bakes", active: true, createdAt: NOW, updatedAt: NOW }] as LocalWorkspace["products"];
  ws.recipes = [
    { id: "rec-brownie", productId: "prod-brownie", name: "Classic Brownies", category: "Bakes", baseYieldQuantity: 16, yieldUnit: "pcs", instructions: [], formulaMetadata: {}, costProfile: {}, active: true, createdAt: NOW, updatedAt: NOW }
  ] as LocalWorkspace["recipes"];
  ws.recipeItems = [
    { id: "ri-flour", recipeId: "rec-brownie", ingredientId: "flour", quantity: 500, unit: "g", wastePercentage: 0, prepState: {}, createdAt: NOW, updatedAt: NOW },
    { id: "ri-sugar", recipeId: "rec-brownie", ingredientId: "sugar", quantity: 300, unit: "g", wastePercentage: 0, prepState: {}, createdAt: NOW, updatedAt: NOW }
  ] as LocalWorkspace["recipeItems"];
  return ws;
}

// Applies an engine result back onto a workspace, the way the store does after a
// successful IndexedDB write.
function apply(ws: LocalWorkspace, out: ReturnType<typeof runLocalAction>): LocalWorkspace {
  const next: LocalWorkspace = { ...ws, ...(out.changes.collections ?? {}) } as LocalWorkspace;
  if (out.changes.settings) next.settings = out.changes.settings;
  if (out.changes.claimProductionRun) next.productionRuns = [...ws.productionRuns, out.changes.claimProductionRun];
  return next;
}

function run(ws: LocalWorkspace, action: string, payload: Record<string, unknown> = {}) {
  return runLocalAction(ws, action, payload, actor, NOW);
}

const findIngredient = (ws: LocalWorkspace, ingredientId: string) => ws.ingredients.find((row) => row.id === ingredientId)!;
const findBatch = (ws: LocalWorkspace, batchId: string) => ws.ingredientBatches.find((row) => row.id === batchId)!;
const findOrder = (ws: LocalWorkspace, orderId: string) => ws.orders.find((row) => row.id === orderId)!;
const firstOrderId = (ws: LocalWorkspace) => ws.orders[0].id;

function orderFor(ws: LocalWorkspace, pieces: number, extra: Record<string, unknown> = {}) {
  return run(ws, "order.save", {
    order: {
      customerName: "Ada",
      dueDate: "2026-08-20",
      items: [{ recipeId: "rec-brownie", requestedYieldQuantity: pieces, quantityMultiplier: 1, saleQuantity: 1, unitSellingPrice: 7500 }],
      ...extra
    }
  });
}

describe("requirements use the server's formula, not the display-rounded preview", () => {
  it("scales linearly with the requested yield", () => {
    let ws = kitchen();
    ws = apply(ws, orderFor(ws, 12));
    const orderId = firstOrderId(ws);
    const reqs = requirementsForOrder(ws, orderId);
    // 500 g at 16 pieces -> 375 g at 12. The kitchen.ts preview would round this.
    expect(reqs.find((r) => r.ingredientId === "flour")?.quantity).toBeCloseTo(375, 6);
    expect(reqs.find((r) => r.ingredientId === "sugar")?.quantity).toBeCloseTo(225, 6);
  });

  it("applies waste percentage without rounding", () => {
    const ws = kitchen();
    (ws.recipeItems[0] as { wastePercentage: number }).wastePercentage = 7.5;
    const withOrder = apply(ws, orderFor(ws, 16));
    const orderId = firstOrderId(withOrder);
    const flour = requirementsForOrder(withOrder, orderId).find((r) => r.ingredientId === "flour");
    expect(flour?.quantity).toBeCloseTo(537.5, 6);
  });

  it("aggregates two lines of the same ingredient", () => {
    const ws = kitchen();
    ws.recipeItems = [
      ...ws.recipeItems,
      { id: "ri-flour-2", recipeId: "rec-brownie", ingredientId: "flour", quantity: 100, unit: "g", wastePercentage: 0, prepState: {}, createdAt: NOW, updatedAt: NOW }
    ] as LocalWorkspace["recipeItems"];
    const withOrder = apply(ws, orderFor(ws, 16));
    const orderId = firstOrderId(withOrder);
    expect(requirementsForOrder(withOrder, orderId).filter((r) => r.ingredientId === "flour")).toHaveLength(1);
    expect(requirementsForOrder(withOrder, orderId).find((r) => r.ingredientId === "flour")?.quantity).toBeCloseTo(600, 6);
  });

  it("converts a recipe unit to the ingredient's base unit through a scoped rule", () => {
    const ws = kitchen();
    (ws.recipeItems[0] as { unit: string; quantity: number }).unit = "cup";
    (ws.recipeItems[0] as { unit: string; quantity: number }).quantity = 2;
    const withOrder = apply(ws, orderFor(ws, 16));
    const orderId = firstOrderId(withOrder);
    // The seeded cr-flour rule is 1 cup = 120 g.
    expect(requirementsForOrder(withOrder, orderId).find((r) => r.ingredientId === "flour")?.quantity).toBeCloseTo(240, 6);
  });
});

describe("order pricing is the shared strict contract", () => {
  it("persists recomputed totals and ignores client-supplied ones", () => {
    let ws = kitchen();
    ws = apply(
      ws,
      run(ws, "order.save", {
        order: {
          customerName: "Ada",
          dueDate: "2026-08-20",
          taxRate: 7.5,
          deliveryFee: 1500,
          netTotal: 999999,
          grossTotal: 999999,
          items: [{ recipeId: "rec-brownie", requestedYieldQuantity: 16, saleQuantity: 2, unitSellingPrice: 5000 }]
        }
      })
    );
    const order = ws.orders[0];
    expect(order.subtotal).toBe(10000);
    expect(order.netTotal).toBe(10000);
    expect(order.taxAmount).toBe(750);
    expect(order.grossTotal).toBe(12250);
  });

  it("refuses a negative price rather than clamping it, unlike the preview", () => {
    const ws = kitchen();
    expect(() =>
      run(ws, "order.save", {
        order: { customerName: "Ada", dueDate: "2026-08-20", items: [{ recipeId: "rec-brownie", requestedYieldQuantity: 16, saleQuantity: 1, unitSellingPrice: -5 }] }
      })
    ).toThrow(/zero or greater/i);
  });
});

describe("the order lifecycle is enforced, not just hidden by buttons", () => {
  it("refuses a jump from Draft to Produced", () => {
    let ws = kitchen();
    ws = apply(ws, orderFor(ws, 16));
    const orderId = firstOrderId(ws);
    expect(() => run(ws, "order.status", { orderId, status: "Produced" })).toThrow(/cannot move|before marking/i);
  });

  it("requires a reason to cancel", () => {
    let ws = kitchen();
    ws = apply(ws, orderFor(ws, 16));
    const orderId = firstOrderId(ws);
    expect(() => run(ws, "order.status", { orderId, status: "Cancelled" })).toThrow(/reason/i);
    expect(() => run(ws, "order.status", { orderId, status: "Cancelled", reason: "Customer changed mind" })).not.toThrow();
  });

  it("refuses to deliver an order that was never produced", () => {
    let ws = kitchen();
    ws = apply(ws, orderFor(ws, 16));
    const orderId = firstOrderId(ws);
    expect(() => run(ws, "order.status", { orderId, status: "Delivered" })).toThrow(/cannot move|produced/i);
  });
});

describe("stock is held at confirmation and deducted exactly once", () => {
  it("holds without deducting when an order is confirmed", () => {
    let ws = kitchen({ flour: 1000, sugar: 1000 });
    ws = apply(ws, orderFor(ws, 16));
    const orderId = firstOrderId(ws);
    ws = apply(ws, run(ws, "order.status", { orderId, status: "Confirmed" }));

    const flour = findIngredient(ws, "flour");
    expect(flour.currentStock).toBe(1000); // withheld, not removed
    expect(flour.reservedStock).toBeCloseTo(500, 6);
  });

  it("deducts once at completion and refuses a second production", () => {
    let ws = kitchen({ flour: 1000, sugar: 1000 });
    ws = apply(ws, orderFor(ws, 16));
    const orderId = firstOrderId(ws);
    ws = apply(ws, run(ws, "order.status", { orderId, status: "Confirmed" }));
    ws = apply(ws, run(ws, "order.status", { orderId, status: "In Production" }));
    ws = apply(ws, run(ws, "order.produce", { orderId }));

    const afterFirst = findIngredient(ws, "flour");
    expect(afterFirst.currentStock).toBeCloseTo(500, 6);
    expect(afterFirst.reservedStock).toBeCloseTo(0, 6);
    expect(ws.productionRuns).toHaveLength(1);

    const second = run(ws, "order.produce", { orderId });
    expect(second.result).toMatchObject({ alreadyProduced: true });
    const afterSecond = findIngredient(apply(ws, second), "flour");
    expect(afterSecond.currentStock).toBeCloseTo(500, 6);
  });

  it("holds nothing for a draft", () => {
    let ws = kitchen({ flour: 1000, sugar: 1000 });
    ws = apply(ws, orderFor(ws, 16));
    const flour = findIngredient(ws, "flour");
    expect(flour.reservedStock).toBe(0);
  });

  it("holds nothing when the hold stage is none", () => {
    let ws = kitchen({ flour: 1000, sugar: 1000 });
    ws.settings = { ...ws.settings, stockHoldStage: "none" };
    ws = apply(ws, orderFor(ws, 16));
    const orderId = firstOrderId(ws);
    ws = apply(ws, run(ws, "order.status", { orderId, status: "Confirmed" }));
    const flour = findIngredient(ws, "flour");
    expect(flour.reservedStock).toBe(0);
  });
});

describe("a second order sees the first order's hold", () => {
  it("accepts the order but flags a shortage, and never holds more than exists", () => {
    let ws = kitchen({ flour: 1000, sugar: 5000 });
    ws = apply(ws, orderFor(ws, 16)); // needs 500 g flour
    const firstId = ws.orders[0].id;
    ws = apply(ws, run(ws, "order.status", { orderId: firstId, status: "Confirmed" }));

    ws = apply(ws, orderFor(ws, 25)); // needs ~781 g, only 500 free
    const secondId = ws.orders[1].id;
    ws = apply(ws, run(ws, "order.status", { orderId: secondId, status: "Confirmed" }));

    const second = findOrder(ws, secondId);
    expect(second.stockStatus).toBe("Shortage");

    const flour = findIngredient(ws, "flour");
    expect(flour.reservedStock).toBeLessThanOrEqual(flour.currentStock);
  });

  it("returns the hold when an order is cancelled", () => {
    let ws = kitchen({ flour: 1000, sugar: 1000 });
    ws = apply(ws, orderFor(ws, 16));
    const orderId = firstOrderId(ws);
    ws = apply(ws, run(ws, "order.status", { orderId, status: "Confirmed" }));
    expect(ws.ingredients[0].reservedStock).toBeCloseTo(500, 6);

    ws = apply(ws, run(ws, "order.status", { orderId, status: "Cancelled", reason: "Customer cancelled" }));
    expect(ws.ingredients[0].reservedStock).toBeCloseTo(0, 6);
  });
});

describe("FEFO lots are consumed soonest-expiry first", () => {
  it("spans lots in expiry order and clamps at zero", () => {
    let ws = kitchen({ flour: 1000, sugar: 1000 });
    ws.ingredientBatches = [
      { id: "lot-late", ingredientId: "flour", quantityReceived: 600, quantityRemaining: 600, unit: "g", expiryDate: "2026-12-01", receivedDate: "2026-08-01", createdAt: NOW, updatedAt: NOW },
      { id: "lot-soon", ingredientId: "flour", quantityReceived: 400, quantityRemaining: 400, unit: "g", expiryDate: "2026-09-01", receivedDate: "2026-08-02", createdAt: NOW, updatedAt: NOW }
    ] as LocalWorkspace["ingredientBatches"];

    ws = apply(ws, orderFor(ws, 16));
    const orderId = firstOrderId(ws);
    ws = apply(ws, run(ws, "order.status", { orderId, status: "Confirmed" }));
    ws = apply(ws, run(ws, "order.status", { orderId, status: "In Production" }));
    ws = apply(ws, run(ws, "order.produce", { orderId }));

    const soon = findBatch(ws, "lot-soon");
    const late = findBatch(ws, "lot-late");
    expect(soon.quantityRemaining).toBe(0); // 400 taken first
    expect(late.quantityRemaining).toBeCloseTo(500, 6); // remaining 100 from the later lot
  });

  it("cannot see a lot recorded in a different unit, while aggregate stock still falls", () => {
    // The server's lot query filters on unit, so a kg lot is invisible to a g
    // deduction. Aggregate stock and lots diverge, which is the documented
    // behaviour rather than a bug this engine invents.
    let ws = kitchen({ flour: 1000, sugar: 1000 });
    ws.ingredientBatches = [
      { id: "lot-kg", ingredientId: "flour", quantityReceived: 1, quantityRemaining: 1, unit: "kg", receivedDate: "2026-08-01", createdAt: NOW, updatedAt: NOW }
    ] as LocalWorkspace["ingredientBatches"];

    ws = apply(ws, orderFor(ws, 16));
    const orderId = firstOrderId(ws);
    ws = apply(ws, run(ws, "order.status", { orderId, status: "Confirmed" }));
    ws = apply(ws, run(ws, "order.status", { orderId, status: "In Production" }));
    ws = apply(ws, run(ws, "order.produce", { orderId }));

    expect(ws.ingredientBatches[0].quantityRemaining).toBe(1);
    expect(ws.ingredients[0].currentStock).toBeCloseTo(500, 6);
  });
});

describe("negative inventory policy", () => {
  it("blocks production when short", () => {
    let ws = kitchen({ flour: 100, sugar: 100 });
    ws = apply(ws, orderFor(ws, 16));
    const orderId = firstOrderId(ws);
    ws = apply(ws, run(ws, "order.status", { orderId, status: "Confirmed" }));
    expect(() => run(ws, "order.status", { orderId, status: "In Production" })).toThrow(/short/i);
  });

  it("allows a backorder when the setting permits it", () => {
    let ws = kitchen({ flour: 100, sugar: 100 });
    ws.settings = { ...ws.settings, allowNegativeInventory: true };
    ws = apply(ws, orderFor(ws, 16));
    const orderId = firstOrderId(ws);
    ws = apply(ws, run(ws, "order.status", { orderId, status: "Confirmed" }));
    ws = apply(ws, run(ws, "order.status", { orderId, status: "In Production" }));
    ws = apply(ws, run(ws, "order.produce", { orderId }));
    expect(ws.ingredients[0].currentStock).toBeLessThan(0);
  });
});

describe("ingredients, stock adjustments and purchases", () => {
  it("refuses a duplicate active name on create", () => {
    let ws = workspace();
    ws = apply(ws, run(ws, "ingredient.save", { ingredient: { name: "Butter", category: "Dairy", baseUnit: "g", currentStock: 100 } }));
    expect(() => run(ws, "ingredient.save", { ingredient: { name: "butter", category: "Dairy", baseUnit: "g" } })).toThrow(/already exists/i);
  });

  it("converts a purchase unit and records a lot and a movement", () => {
    let ws = workspace();
    ws = apply(
      ws,
      run(ws, "ingredient.save", {
        ingredient: { name: "Flour", category: "Dry", baseUnit: "g", currentStock: 0, purchaseUnit: "kg", purchaseQuantity: 2, purchasePrice: 3000 }
      })
    );
    const ingredient = ws.ingredients[0];
    expect(ingredient.currentStock).toBe(2000);
    expect(ingredient.latestUnitCost).toBeCloseTo(1.5, 6);
    expect(ws.ingredientBatches).toHaveLength(1);
    expect(ws.inventoryMovements.filter((m) => m.movementType === "purchase")).toHaveLength(1);
  });

  it("refuses a purchase unit that cannot convert to the base unit", () => {
    const ws = workspace();
    expect(() =>
      run(ws, "ingredient.save", { ingredient: { name: "Eggs", category: "Dairy", baseUnit: "g", purchaseUnit: "pcs", purchaseQuantity: 12, purchasePrice: 100 } })
    ).toThrow(/cannot be converted/i);
  });

  it("refuses a fractional quantity of a count unit", () => {
    const ws = workspace();
    expect(() => run(ws, "ingredient.save", { ingredient: { name: "Eggs", category: "Dairy", baseUnit: "pcs", currentStock: 1.5 } })).toThrow();
  });

  it("refuses an adjustment that would take stock below zero", () => {
    let ws = workspace();
    ws = apply(ws, run(ws, "ingredient.save", { ingredient: { name: "Flour", category: "Dry", baseUnit: "g", currentStock: 100 } }));
    const ingredientId = ws.ingredients[0].id;
    expect(() => run(ws, "inventory.adjust", { ingredientId, movementType: "waste", quantityChange: -500 })).toThrow(/below zero/i);
  });

  it("refuses an unknown movement type", () => {
    let ws = workspace();
    ws = apply(ws, run(ws, "ingredient.save", { ingredient: { name: "Flour", category: "Dry", baseUnit: "g", currentStock: 100 } }));
    const ingredientId = ws.ingredients[0].id;
    expect(() => run(ws, "inventory.adjust", { ingredientId, movementType: "vanish", quantityChange: -1 })).toThrow(/unsupported/i);
  });
});

describe("conversions", () => {
  it("refuses to apply a conversion to a line that has moved since the review opened", () => {
    const ws = kitchen();
    expect(() =>
      run(ws, "conversion.applyToRecipeItem", {
        recipeItemId: "ri-flour",
        expectedQuantity: 999,
        expectedUnit: "g",
        finalQuantity: 240,
        finalUnit: "g"
      })
    ).toThrow(/now 500g/i);
  });

  it("applies a reviewed conversion and records where the value came from", () => {
    let ws = kitchen();
    ws = apply(
      ws,
      run(ws, "conversion.applyToRecipeItem", {
        recipeItemId: "ri-flour",
        expectedQuantity: 500,
        expectedUnit: "g",
        finalQuantity: 0.5,
        finalUnit: "kg",
        conversionRuleId: "cr-flour"
      })
    );
    const line = ws.recipeItems.find((row) => row.id === "ri-flour") as any;
    expect(line.quantity).toBe(0.5);
    expect(line.unit).toBe("kg");
    expect(line.prepState.convertedFromQuantity).toBe(500);
    expect(line.prepState.convertedFromUnit).toBe("g");
  });

  it("a recipe save replaces its lines, which invalidates a pending conversion review", () => {
    let ws = kitchen();
    ws = apply(
      ws,
      run(ws, "recipe.save", {
        recipe: {
          id: "rec-brownie",
          name: "Classic Brownies",
          baseYieldQuantity: 16,
          items: [{ ingredientId: "flour", quantity: 500, unit: "g" }]
        }
      })
    );
    expect(ws.recipeItems.some((row) => row.id === "ri-flour")).toBe(false);
    expect(() =>
      run(ws, "conversion.applyToRecipeItem", { recipeItemId: "ri-flour", expectedQuantity: 500, expectedUnit: "g", finalQuantity: 0.5, finalUnit: "kg" })
    ).toThrow(/not found/i);
  });
});

describe("archive and restore", () => {
  it("round-trips an ingredient", () => {
    let ws = workspace();
    ws = apply(ws, run(ws, "ingredient.save", { ingredient: { name: "Flour", category: "Dry", baseUnit: "g", currentStock: 100 } }));
    const ingredientId = ws.ingredients[0].id;

    ws = apply(ws, run(ws, "ingredient.delete", { id: ingredientId }));
    expect(ws.ingredients[0].active).toBe(false);
    expect((run(ws, "archive.list").result as { ingredients: unknown[] }).ingredients).toHaveLength(1);

    ws = apply(ws, run(ws, "archive.restore", { entityType: "ingredient", id: ingredientId }));
    expect(ws.ingredients[0].active).toBe(true);
  });

  it("restoring a recipe brings its product back too", () => {
    let ws = kitchen();
    ws = apply(ws, run(ws, "recipe.delete", { id: "rec-brownie" }));
    expect(ws.products[0].active).toBe(false);
    ws = apply(ws, run(ws, "archive.restore", { entityType: "recipe", id: "rec-brownie" }));
    expect(ws.products[0].active).toBe(true);
  });

  it("refuses an unsupported archive type", () => {
    const ws = workspace();
    expect(() => run(ws, "archive.restore", { entityType: "invoice", id: "x" })).toThrow(/unsupported/i);
  });
});

describe("staff and schema stay central", () => {
  it.each(["user.save", "user.disable", "user.revokeSessions", "schema.ensure"])("refuses %s", (action) => {
    const ws = workspace();
    expect(() => run(ws, action, {})).toThrow(/managed centrally/i);
  });

  it("refuses the two actions that belong to the server", () => {
    const ws = workspace();
    expect(() => run(ws, "import.extract", {})).toThrow(/on the server/i);
    expect(() => run(ws, "notification.lowStockEmail", {})).toThrow(/on the server/i);
  });
});

describe("every mutating action leaves an audit trail", () => {
  it("records an entry for each change", () => {
    let ws = workspace();
    const before = ws.auditLogs.length;
    ws = apply(ws, run(ws, "ingredient.save", { ingredient: { name: "Flour", category: "Dry", baseUnit: "g", currentStock: 100 } }));
    ws = apply(ws, run(ws, "settings.save", { settings: { businessName: "Test Kitchen" } }));
    ws = apply(ws, run(ws, "supplier.save", { supplier: { name: "Mill Co" } }));
    expect(ws.auditLogs.length).toBe(before + 3);
    for (const row of ws.auditLogs.slice(before)) {
      expect((row as { actor: string }).actor).toBe("Device Tester");
    }
  });
});

describe("a rejected action changes nothing", () => {
  it("leaves the workspace untouched when validation fails", () => {
    const ws = kitchen({ flour: 100, sugar: 100 });
    const snapshot = JSON.stringify(ws);
    expect(() => run(ws, "ingredient.save", { ingredient: { name: "", category: "Dry", baseUnit: "g" } })).toThrow();
    expect(JSON.stringify(ws)).toBe(snapshot);
  });
});
