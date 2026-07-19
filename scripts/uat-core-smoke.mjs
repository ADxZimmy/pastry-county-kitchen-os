// Stage 015-A: Authenticated Demo Trust UAT.
//
// Walks the July 10 audit's Prompt 10 scenario end to end against production and
// asserts the Demo Trust findings (PCO-001..009, 014, 016) actually behave.
//
// Safety contract:
//   * Every record it creates is named with a unique run id and tracked in a
//     manifest. It only ever updates or archives ids it created.
//   * It aborts BEFORE any mutation if the run id already appears in the data.
//   * Cleanup runs in `finally` and the gate FAILS if manifest-owned records are
//     still active afterwards.
//   * It never mutates a pre-existing business record, and it restores any
//     setting it changes.
import { config } from "dotenv";
import { authHeaders, resolveSmokeSession } from "./_smoke-session.mjs";

config({ path: ".env.local" });
config();

const baseURL = process.env.UAT_CORE_SMOKE_BASE_URL ?? process.env.LIVE_BASE_URL ?? "https://pastry-county-kitchen-os.vercel.app";
const email = process.env.LIVE_TEST_EMAIL;
const password = process.env.LIVE_TEST_PASSWORD;
const RUN_ID = `AUDIT-UAT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

if (!email || !password) {
  console.error("uat-core smoke requires LIVE_TEST_EMAIL and LIVE_TEST_PASSWORD.");
  process.exit(1);
}

const manifest = { ingredients: [], recipes: [], orders: [] };
const results = [];
let session = null;

function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail: detail ?? "" });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` -> ${detail}` : ""}`);
}

function near(actual, expected, tolerance = 0.01) {
  return Math.abs(Number(actual) - Number(expected)) <= tolerance;
}

async function req(path, options = {}) {
  const response = await fetch(new URL(path, baseURL), {
    ...options,
    headers: { "Content-Type": "application/json", ...(session ? authHeaders(baseURL, session) : {}), ...(options.headers ?? {}) }
  });
  const text = await response.text();
  let body = {};
  if (text) { try { body = JSON.parse(text); } catch { body = { raw: text }; } }
  return { status: response.status, body };
}

const action = (name, payload = {}) => req("/api/actions", { method: "POST", body: JSON.stringify({ action: name, ...payload }) });
const snapshot = async () => (await req("/api/bootstrap")).body;
const named = (label) => `${RUN_ID} ${label}`;

// ---------------------------------------------------------------- fixtures --
// The audit's own ingredient costs (section G).
const INGREDIENT_FIXTURES = [
  { key: "flour", label: "Flour", unit: "g", stock: 10000, unitCost: 0.5 },
  { key: "sugar", label: "Sugar", unit: "g", stock: 10000, unitCost: 0.64 },
  { key: "cocoa", label: "Cocoa Powder", unit: "g", stock: 5000, unitCost: 4.2 },
  { key: "chocolate", label: "Dark Chocolate", unit: "g", stock: 5000, unitCost: 8 },
  { key: "eggs", label: "Eggs", unit: "pcs", stock: 60, unitCost: 200 },
  { key: "oil", label: "Coconut Oil", unit: "ml", stock: 5000, unitCost: 1.1 }
];
// The audit's 16-piece Brownies formula.
const RECIPE_LINES = [
  { key: "flour", quantity: 300, unit: "g" },
  { key: "sugar", quantity: 500, unit: "g" },
  { key: "cocoa", quantity: 120, unit: "g" },
  { key: "chocolate", quantity: 250, unit: "g" },
  { key: "eggs", quantity: 4, unit: "pcs" },
  { key: "oil", quantity: 180, unit: "ml" }
];
// Scaling 16 -> 12 is x0.75; these are the audit's expected scaled quantities.
const EXPECTED_12 = { flour: 225, sugar: 375, cocoa: 90, chocolate: 187.5, eggs: 3, oil: 135 };

async function main() {
  // Cookie session, not a bearer token: this gate must exercise the same
  // credential an operator's browser carries.
  session = await resolveSmokeSession(baseURL, email, password, { label: "uat-core gate" });
  if (!session?.sessionCookie) throw new Error("Login did not return a session cookie.");

  // --- Guard: refuse to run if this run id somehow already exists in the data.
  const before = await snapshot();
  const preexisting = [
    ...(before.ingredients ?? []).map((i) => i.name),
    ...(before.recipes ?? []).map((r) => r.name),
    ...(before.orders ?? []).map((o) => o.customerName)
  ].filter((name) => String(name ?? "").includes(RUN_ID));
  if (preexisting.length) throw new Error(`Run id collision; aborting before any mutation: ${preexisting.join(", ")}`);
  check("run id is unique in production before any write", true, RUN_ID);

  // -- PCO-006 / PCO-008: invalid input is rejected before anything persists ---
  const zeroYield = await action("recipe.save", { recipe: { name: named("bad-yield"), category: "Test", baseYieldQuantity: 0, yieldUnit: "pieces", instructions: "", items: [{ ingredientId: "x", quantity: 1, unit: "g" }] } });
  check("PCO-006 zero base yield rejected (400)", zeroYield.status === 400, `${zeroYield.status} ${zeroYield.body.error ?? ""}`);

  const fractionalPack = await action("ingredient.save", { ingredient: { name: named("bad-pack"), category: "Packaging", baseUnit: "pack", currentStock: 1.5, reorderLevel: 0, latestUnitCost: 1 } });
  check("PCO-008 fractional count stock rejected (400)", fractionalPack.status === 400, `${fractionalPack.status} ${fractionalPack.body.error ?? ""}`);

  // ------------------------------------------------------------- fixtures ---
  const ingredientIds = {};
  for (const fixture of INGREDIENT_FIXTURES) {
    const saved = await action("ingredient.save", {
      ingredient: { name: named(fixture.label), category: "Dry Goods", baseUnit: fixture.unit, currentStock: fixture.stock, reorderLevel: 0, latestUnitCost: fixture.unitCost }
    });
    if (saved.status !== 200 || !saved.body.id) throw new Error(`Fixture ingredient ${fixture.label} failed (${saved.status}).`);
    ingredientIds[fixture.key] = saved.body.id;
    manifest.ingredients.push(saved.body.id);
  }
  check("created the audit's inventory fixtures", manifest.ingredients.length === INGREDIENT_FIXTURES.length, `${manifest.ingredients.length} ingredients`);

  const recipe = await action("recipe.save", {
    recipe: {
      name: named("Brownies"), category: "Brownies", baseYieldQuantity: 16, yieldUnit: "pieces", instructions: "Mix\nBake",
      items: RECIPE_LINES.map((line) => ({ ingredientId: ingredientIds[line.key], quantity: line.quantity, unit: line.unit, wastePercentage: 0 }))
    }
  });
  if (recipe.status !== 200 || !recipe.body.id) throw new Error(`Fixture recipe failed (${recipe.status}).`);
  manifest.recipes.push(recipe.body.id);
  const recipeId = recipe.body.id;
  const productId = recipe.body.productId;

  // Refresh-after-write: the recipe must come back exactly as stored.
  const afterRecipe = await snapshot();
  const storedRecipe = (afterRecipe.recipes ?? []).find((r) => r.id === recipeId);
  const storedLines = (afterRecipe.recipeItems ?? []).filter((i) => i.recipeId === recipeId);
  check("16-piece recipe persists after refresh", storedRecipe?.baseYieldQuantity === 16 && storedLines.length === RECIPE_LINES.length, `yield=${storedRecipe?.baseYieldQuantity} lines=${storedLines.length}`);

  // ---------------- PCO-002: each order carries its OWN price, never 18,000 ---
  const orderA = await action("order.save", {
    reserve: true,
    order: {
      customerName: named("Order A"), dueDate: new Date().toISOString().slice(0, 10), deliveryMethod: "Pickup",
      paymentStatus: "Unpaid", status: "Confirmed", deliveryFee: 0, discountAmount: 0, taxRate: 0, amountPaid: 0,
      items: [{ productId, recipeId, requestedYieldQuantity: 12, yieldUnit: "pieces", quantityMultiplier: 1, saleQuantity: 12, unitSellingPrice: 625 }]
    }
  });
  if (orderA.status !== 200 || !orderA.body.id) throw new Error(`Order A failed (${orderA.status}): ${orderA.body.error ?? ""}`);
  manifest.orders.push(orderA.body.id);

  const orderB = await action("order.save", {
    order: {
      customerName: named("Order B"), dueDate: new Date().toISOString().slice(0, 10), deliveryMethod: "Delivery",
      paymentStatus: "Unpaid", status: "Confirmed", deliveryFee: 0, discountAmount: 0, taxRate: 0, amountPaid: 0,
      items: [{ productId, recipeId, requestedYieldQuantity: 8, yieldUnit: "pieces", quantityMultiplier: 1, saleQuantity: 1, unitSellingPrice: 40000 }]
    }
  });
  if (orderB.status !== 200 || !orderB.body.id) throw new Error(`Order B failed (${orderB.status}): ${orderB.body.error ?? ""}`);
  manifest.orders.push(orderB.body.id);

  const priced = await snapshot();
  const a = (priced.orders ?? []).find((o) => o.id === orderA.body.id);
  const b = (priced.orders ?? []).find((o) => o.id === orderB.body.id);
  check("PCO-002 order A nets its own 7,500 (not 18,000)", near(a?.netTotal, 7500), `netTotal=${a?.netTotal}`);
  check("PCO-002 order B nets its own 40,000 (not 18,000)", near(b?.netTotal, 40000), `netTotal=${b?.netTotal}`);
  check("PCO-002 two orders do not share a price", !near(a?.netTotal, b?.netTotal, 0.001), `${a?.netTotal} vs ${b?.netTotal}`);

  // ------------- PCO-001: per-order event history, isolated, real actors ------
  const eventsA = (priced.orderEvents ?? []).filter((e) => e.orderId === orderA.body.id);
  const eventsB = (priced.orderEvents ?? []).filter((e) => e.orderId === orderB.body.id);
  check("PCO-001 order A has its own events", eventsA.length > 0, `${eventsA.length} events`);
  check("PCO-001 order B has its own events", eventsB.length > 0, `${eventsB.length} events`);
  check("PCO-001 events never cross orders", eventsA.every((e) => e.orderId === orderA.body.id) && eventsB.every((e) => e.orderId === orderB.body.id), "no cross-linked events");
  check("PCO-001 events name a real actor (not 'system')", eventsA.every((e) => e.actorName && e.actorName !== "system"), eventsA.map((e) => e.actorName)[0] ?? "");
  check("PCO-001 no fabricated May 18 2026 / shortage entries", !eventsA.some((e) => String(e.note ?? "").includes("May 18") || String(e.note ?? "").includes("Dark Chocolate and Eggs")), "clean");

  // --- Audit section G: scaling verified through REAL server-side deduction ---
  const stockBefore = Object.fromEntries(INGREDIENT_FIXTURES.map((f) => [f.key, (priced.ingredients ?? []).find((i) => i.id === ingredientIds[f.key])?.currentStock]));
  const started = await action("order.status", { orderId: orderA.body.id, status: "In Production", productionStatus: "In Progress" });
  check("PCO-004 production start accepted for a reserved order", started.status === 200, `${started.status}`);

  const produced = await action("order.produce", { orderId: orderA.body.id });
  check("production completes", produced.status === 200 && produced.body.produced === true, `${produced.status}`);

  const afterProduce = await snapshot();
  const deducted = {};
  for (const fixture of INGREDIENT_FIXTURES) {
    const now = (afterProduce.ingredients ?? []).find((i) => i.id === ingredientIds[fixture.key])?.currentStock;
    deducted[fixture.key] = Number(stockBefore[fixture.key]) - Number(now);
  }
  const scalingOk = Object.entries(EXPECTED_12).every(([key, expected]) => near(deducted[key], expected));
  check("audit scaling 16->12 verified by real deductions", scalingOk, Object.entries(EXPECTED_12).map(([k, v]) => `${k} ${deducted[k]}/${v}`).join(", "));

  // ------------------- PCO-005: completion is idempotent, never double-deducts -
  const repeat = await action("order.produce", { orderId: orderA.body.id });
  const afterRepeat = await snapshot();
  const chocolateAfterRepeat = (afterRepeat.ingredients ?? []).find((i) => i.id === ingredientIds.chocolate)?.currentStock;
  const chocolateAfterFirst = (afterProduce.ingredients ?? []).find((i) => i.id === ingredientIds.chocolate)?.currentStock;
  check("PCO-005 repeat produce is idempotent", repeat.status === 200 && repeat.body.alreadyProduced === true, JSON.stringify(repeat.body));
  check("PCO-005 stock deducted exactly once", near(chocolateAfterRepeat, chocolateAfterFirst), `${chocolateAfterFirst} -> ${chocolateAfterRepeat}`);

  // ----------------------------- PCO-009: cancellation is guarded ------------
  const cancelNoReason = await action("order.status", { orderId: orderB.body.id, status: "Cancelled" });
  check("PCO-009 cancellation requires a reason (400)", cancelNoReason.status === 400, `${cancelNoReason.status}`);

  const cancelProduced = await action("order.status", { orderId: orderA.body.id, status: "Cancelled", reason: "uat" });
  check("PCO-009 cancelling a produced order is blocked (409)", cancelProduced.status === 409, `${cancelProduced.status}`);

  const cancelOk = await action("order.status", { orderId: orderB.body.id, status: "Cancelled", reason: `${RUN_ID} uat cancellation` });
  const afterCancel = await snapshot();
  const bCancelled = (afterCancel.orders ?? []).find((o) => o.id === orderB.body.id);
  check("PCO-009 pre-production cancellation succeeds with a reason", cancelOk.status === 200 && bCancelled?.status === "Cancelled", `${cancelOk.status} status=${bCancelled?.status}`);
  const cancelEvent = (afterCancel.orderEvents ?? []).find((e) => e.orderId === orderB.body.id && e.eventType === "cancelled");
  check("PCO-009 cancellation reason is recorded on the event", String(cancelEvent?.note ?? "").includes("uat cancellation"), cancelEvent?.note ?? "");

  // ----------------- PCO-005 state machine: invalid jumps are refused --------
  const backwards = await action("order.status", { orderId: orderA.body.id, status: "In Production" });
  check("PCO-005 backwards transition refused (409)", backwards.status === 409, `${backwards.status}`);

  // --------------- PCO-003: a reviewed conversion really changes a recipe ----
  const flourLine = storedLines.find((line) => line.ingredientId === ingredientIds.flour);
  const staleApply = await action("conversion.applyToRecipeItem", { recipeItemId: flourLine.id, expectedQuantity: 999, expectedUnit: "g", finalQuantity: 1, finalUnit: "kg" });
  check("PCO-003 stale conversion apply refused (409)", staleApply.status === 409, `${staleApply.status}`);

  const applied = await action("conversion.applyToRecipeItem", { recipeItemId: flourLine.id, expectedQuantity: 300, expectedUnit: "g", finalQuantity: 0.3, finalUnit: "kg" });
  const afterApply = await snapshot();
  const convertedLine = (afterApply.recipeItems ?? []).find((i) => i.id === flourLine.id);
  check("PCO-003 reviewed conversion applies and persists", applied.status === 200 && near(convertedLine?.quantity, 0.3, 0.0001) && convertedLine?.unit === "kg", `${convertedLine?.quantity}${convertedLine?.unit}`);
  check("PCO-003 conversion provenance recorded", near(convertedLine?.prepState?.convertedFromQuantity, 300) && convertedLine?.prepState?.convertedFromUnit === "g" && Boolean(convertedLine?.prepState?.conversionAppliedBy), `from=${convertedLine?.prepState?.convertedFromQuantity}${convertedLine?.prepState?.convertedFromUnit}`);

  // ------------------------------- PCO-016: no encoding artefacts ------------
  const page = await (await fetch(baseURL)).text();
  const bundleMatch = page.match(/assets\/index-[A-Za-z0-9_-]+\.js/);
  const bundle = bundleMatch ? await (await fetch(new URL(bundleMatch[0], baseURL))).text() : "";
  check("PCO-016 no mojibake in the shipped bundle", bundle.length > 0 && !bundle.includes("Â·"), bundleMatch ? bundleMatch[0] : "bundle not found");
  check("PCO-003 shipped bundle makes no AI claim", bundle.includes("Kitchen Helper") && !bundle.includes("AI Assistant"), "helper labelled honestly");
}

async function cleanup() {
  const failures = [];
  // Every archive is attempted independently. A throw partway through used to
  // abandon the remaining records in production, which is exactly the outcome
  // this manifest exists to prevent.
  const archive = async (label, actionName, payload) => {
    try {
      const result = await action(actionName, payload);
      if (result.status !== 200) failures.push(`${label} (${result.status})`);
    } catch (error) {
      failures.push(`${label} (threw: ${error instanceof Error ? error.message : String(error)})`);
    }
  };

  for (const orderId of manifest.orders) await archive(`order ${orderId}`, "order.delete", { orderId });
  for (const recipeId of manifest.recipes) await archive(`recipe ${recipeId}`, "recipe.delete", { recipeId });
  for (const ingredientId of manifest.ingredients) await archive(`ingredient ${ingredientId}`, "ingredient.delete", { ingredientId });

  // Residue check: nothing this run created may still be active.
  const final = await snapshot();
  const activeResidue = [
    ...(final.ingredients ?? []).filter((i) => manifest.ingredients.includes(i.id)).map((i) => `ingredient ${i.id}`),
    ...(final.recipes ?? []).filter((r) => manifest.recipes.includes(r.id)).map((r) => `recipe ${r.id}`),
    ...(final.orders ?? []).filter((o) => manifest.orders.includes(o.id)).map((o) => `order ${o.id}`)
  ];
  check("cleanup archived every manifest record", failures.length === 0, failures.join(", ") || "no archive errors");
  check("no manifest-owned record is still active", activeResidue.length === 0, activeResidue.join(", ") || "clean");

  console.log(`\n--- cleanup manifest (${RUN_ID}) ---`);
  console.log(JSON.stringify({ runId: RUN_ID, manifest, archiveFailures: failures, activeResidue }, null, 2));
  console.log("Note: audit/event/movement ledger rows for these ids are retained by design as history.");
}

let exitCode = 0;
try {
  await main();
} catch (error) {
  check("uat run completed without an unexpected error", false, error instanceof Error ? error.message : String(error));
} finally {
  try {
    if (session) await cleanup();
  } catch (error) {
    check("cleanup completed", false, error instanceof Error ? error.message : String(error));
  }
  const failed = results.filter((entry) => !entry.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log("FAILED CHECKS:");
    for (const entry of failed) console.log(`  - ${entry.name}${entry.detail ? ` (${entry.detail})` : ""}`);
  }
  exitCode = failed.length ? 1 : 0;
  console.log(failed.length
    ? `\nDemo Trust Gate (015-A): NOT PASSED against ${baseURL}.`
    : `\nDemo Trust Gate (015-A): PASSED against ${baseURL}.`);
}
process.exit(exitCode);
