import { describe, expect, it } from "vitest";
import { CONTEXT_LIMITS, boundSnapshot, buildAssistantContext, identityScrubs, scrubIdentities } from "./_assistantContext.js";

// Phase 014-B. The context layer composes three filters that already exist --
// the app's own role filter, the Phase 014-A allow-list, and the leak check --
// and adds the one thing new here: bounded size with admitted truncation.

function syntheticSnapshot({ orders = 0, recipes = 0, items = 0 } = {}) {
  return {
    ingredients: [],
    recipes: Array.from({ length: recipes }, (_, i) => ({ id: `rec-${i}`, name: `Recipe ${i}` })),
    recipeItems: Array.from({ length: items }, (_, i) => ({ id: `ri-${i}`, recipeId: `rec-${i % Math.max(recipes, 1)}` })),
    orders: Array.from({ length: orders }, (_, i) => ({
      id: `ord-${i}`,
      status: i % 3 === 0 ? "Delivered" : "Confirmed",
      dueDate: `2026-08-${String((i % 28) + 1).padStart(2, "0")}`,
      customerName: `Customer ${i}`,
      customerPhone: "0800-000-0000"
    })),
    orderItems: [],
    conversionRules: []
  };
}

describe("bounded snapshot", () => {
  it("keeps a small kitchen whole and reports nothing omitted", () => {
    const { snapshot, omitted } = boundSnapshot(syntheticSnapshot({ orders: 5, recipes: 3, items: 3 }));
    expect(snapshot.orders).toHaveLength(5);
    expect(omitted).toEqual({});
  });

  it("caps a large kitchen and says exactly what was dropped", () => {
    const { snapshot, omitted } = boundSnapshot(syntheticSnapshot({ orders: CONTEXT_LIMITS.orders + 25 }));
    expect(snapshot.orders).toHaveLength(CONTEXT_LIMITS.orders);
    expect(omitted.orders).toBe(25);
  });

  it("prefers active orders over delivered ones when the cap bites", () => {
    const { snapshot } = boundSnapshot(syntheticSnapshot({ orders: CONTEXT_LIMITS.orders + 25 }));
    // Every third synthetic order is Delivered; actives must survive first.
    const kept = snapshot.orders.filter((order) => order.status !== "Delivered").length;
    expect(kept).toBeGreaterThanOrEqual(Math.min(CONTEXT_LIMITS.orders, 33));
  });

  it("drops child rows whose parent was dropped, so the model never sees an orphan", () => {
    const big = syntheticSnapshot({ recipes: CONTEXT_LIMITS.recipes + 10, items: CONTEXT_LIMITS.recipes + 10 });
    const { snapshot } = boundSnapshot(big);
    const keptRecipeIds = new Set(snapshot.recipes.map((row) => row.id));
    for (const item of snapshot.recipeItems) {
      expect(keptRecipeIds.has(item.recipeId)).toBe(true);
    }
  });
});

// The browser's own deterministic helper prints real customer names and costs,
// and a fallback answer sits in the thread until it is replayed as history on
// the next turn. Redacting the rows and not the transcript would close the
// front door and leave the side door open.
describe("identity scrubbing of replayed text", () => {
  const orders = [
    { id: "ord-1042", customerName: "Ada Lovelace", customerPhone: "0801-234-5678" },
    { id: "ord-77", customerName: "Ada", customerPhone: "" }
  ];

  it("replaces a customer name with the same placeholder the records use", () => {
    const scrubs = identityScrubs(orders);
    const cleaned = scrubIdentities("Ada Lovelace: flour short 200g", scrubs);
    expect(cleaned).not.toContain("Ada Lovelace");
    expect(cleaned).toContain("Customer 1042");
    expect(cleaned).toContain("flour short 200g");
  });

  it("replaces the longest name first, so a short name cannot strand a surname", () => {
    const cleaned = scrubIdentities("Ada Lovelace owes money", identityScrubs(orders));
    expect(cleaned).not.toContain("Lovelace");
  });

  it("removes a phone number even when it belongs to nobody in the records", () => {
    const cleaned = scrubIdentities("call them on +234 802 111 2222 today", []);
    expect(cleaned).not.toContain("802 111 2222");
    expect(cleaned).toContain("[redacted number]");
  });

  it("ignores blank and near-empty names rather than shredding the text", () => {
    const scrubs = identityScrubs([{ id: "o", customerName: "Al", customerPhone: "" }]);
    expect(scrubs).toHaveLength(0);
    expect(scrubIdentities("Also, all the almonds", scrubs)).toBe("Also, all the almonds");
  });
});

describe("assistant context assembly", () => {
  // The fake database returns a customer-bearing order row for every query the
  // snapshot loader makes. Whatever position each result lands in, no customer
  // identity may survive to the assembled context.
  const customerRow = {
    id: "ord-1",
    status: "Confirmed",
    due_date: "2026-08-20",
    customerName: "Ada Real Person",
    customerPhone: "0801-234-5678",
    notes: "call Ada on 0801-234-5678"
  };
  const fakeSql = async () => [customerRow];
  fakeSql.transaction = async () => [];

  it("builds a payload with no customer identity, whatever the database returned", async () => {
    const context = await buildAssistantContext(fakeSql, { role: "Baker", sub: "user-1" });
    const serialised = JSON.stringify(context);
    expect(serialised).not.toContain("Ada Real Person");
    expect(serialised).not.toContain("0801-234-5678");
    expect(serialised).not.toContain("customerName");
    expect(serialised).not.toContain("notes");
  });

  it("stamps role, freshness, and per-collection counts", async () => {
    const context = await buildAssistantContext(fakeSql, { role: "Viewer", sub: "user-2" });
    expect(context.role).toBe("Viewer");
    expect(new Date(context.generatedAt).toString()).not.toBe("Invalid Date");
    expect(context.counts).toHaveProperty("orders");
    expect(context.truncated).toBe(false);
    // A function, so nothing that serialises the context can leak an identity.
    expect(typeof context.scrub).toBe("function");
    expect(JSON.parse(JSON.stringify(context)).scrub).toBeUndefined();
  });

  it("strips money from a Viewer's orders but keeps it for a Baker", async () => {
    const moneyRow = { ...customerRow, netTotal: 18000, balance: 9000 };
    const moneySql = async () => [moneyRow];
    const viewer = await buildAssistantContext(moneySql, { role: "Viewer", sub: "v" });
    const baker = await buildAssistantContext(moneySql, { role: "Baker", sub: "b" });
    expect(JSON.stringify(viewer.data.orders)).not.toContain("netTotal");
    expect(JSON.stringify(baker.data.orders)).toContain("netTotal");
  });
});
