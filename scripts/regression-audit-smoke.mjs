import { config } from "dotenv";

config({ path: ".env.local" });
config();

const baseURL = process.env.REGRESSION_AUDIT_SMOKE_BASE_URL ?? process.env.LIVE_BASE_URL ?? "https://pastry-county-kitchen-os.vercel.app";
const email = process.env.LIVE_TEST_EMAIL;
const password = process.env.LIVE_TEST_PASSWORD;
const allowMutations = process.env.REGRESSION_AUDIT_SMOKE_MUTATE === "1";
const runId = `audit-smoke-${Date.now()}`;

function assertPrerequisites() {
  const missing = [];
  if (!email) missing.push("LIVE_TEST_EMAIL");
  if (!password) missing.push("LIVE_TEST_PASSWORD");
  if (!allowMutations) missing.push("REGRESSION_AUDIT_SMOKE_MUTATE=1");
  if (missing.length) {
    throw new Error(`Regression audit smoke prerequisites missing: ${missing.join(", ")}. Add the live test credentials to .env.local, then run in PowerShell: $env:REGRESSION_AUDIT_SMOKE_MUTATE="1"; npm run smoke:regression-audit`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertNear(actual, expected, label) {
  assert(Math.abs(Number(actual) - expected) < 0.0001, `${label} expected ${expected}, received ${actual}.`);
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    throw new Error("Playwright is not installed. Run `npm install -D playwright` and `npx playwright install chromium` before this smoke test.");
  }
}

async function requestJson(path, options = {}) {
  const response = await fetch(new URL(path, baseURL), {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {})
    }
  });
  const text = await response.text();
  let body = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }
  if (!response.ok) {
    throw new Error(body.error || body.raw || `${path} returned ${response.status}.`);
  }
  return body;
}

async function login() {
  return requestJson("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
}

function actionClient(token) {
  return async function action(action, payload = {}) {
    return requestJson("/api/actions", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, ...payload })
    });
  };
}

async function bootstrap(token) {
  return requestJson("/api/bootstrap", {
    headers: { Authorization: `Bearer ${token}` }
  });
}

function ingredientById(snapshot, id) {
  const ingredient = snapshot.ingredients.find((item) => item.id === id);
  assert(ingredient, `Ingredient ${id} was not returned by bootstrap.`);
  return ingredient;
}

function batchByIngredient(snapshot, ingredientId) {
  const batch = snapshot.ingredientBatches.find((item) => item.ingredientId === ingredientId);
  assert(batch, `No FEFO batch was returned for ${ingredientId}.`);
  return batch;
}

async function clickVisible(locator, label) {
  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);
    if (await candidate.isVisible()) {
      await candidate.click();
      return;
    }
  }
  throw new Error(`No visible control found for ${label}.`);
}

async function assertNoHorizontalOverflow(page, label) {
  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  assert(!hasOverflow, `${label} has horizontal overflow.`);
}

async function assertModalUsable(page, label) {
  const layout = await page.evaluate(() => {
    const modal = document.querySelector(".confirm-modal")?.getBoundingClientRect();
    const actions = document.querySelector(".confirm-modal .button-row")?.getBoundingClientRect();
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      modal: modal ? { left: modal.left, right: modal.right, top: modal.top, bottom: modal.bottom } : null,
      actions: actions ? { left: actions.left, right: actions.right, top: actions.top, bottom: actions.bottom } : null,
      pageOverflow: document.documentElement.scrollWidth > window.innerWidth + 1
    };
  });
  assert(layout.modal, `${label} modal was not rendered.`);
  assert(!layout.pageOverflow, `${label} introduced page-level horizontal overflow.`);
  assert(layout.modal.left >= 0 && layout.modal.right <= layout.width + 1, `${label} modal exceeds viewport width.`);
  assert(layout.modal.top >= 0 && layout.modal.bottom <= layout.height + 1, `${label} modal exceeds viewport height.`);
  assert(layout.actions && layout.actions.bottom <= layout.height + 1, `${label} modal actions are not reachable.`);
}

async function runBrowserChecks(user, flourName) {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  try {
    await page.addInitScript((session) => {
      window.localStorage.setItem("pastry-county-session", JSON.stringify(session));
    }, { page: "inventory", user });
    await page.goto(`${baseURL}/#inventory`, { waitUntil: "networkidle" });
    await page.getByText("Pastry County Kitchen OS").first().waitFor({ state: "visible" });
    await assertNoHorizontalOverflow(page, "Inventory");

    await page.getByPlaceholder("Search ingredients").fill(flourName);
    const flourCard = page.locator(".item-card", { hasText: flourName }).first();
    await flourCard.waitFor({ state: "visible" });
    await flourCard.getByText(/0\.50\/g/).first().waitFor({ state: "visible" });

    await clickVisible(page.getByRole("button", { name: /add ingredient/i }), "Add Ingredient");
    const purchaseUnitSelect = page.locator('select[name="purchaseUnit"]');
    await purchaseUnitSelect.selectOption("pcs");
    assert(await purchaseUnitSelect.inputValue() === "pcs", "Purchase Unit selector did not change to pcs.");
    await clickVisible(page.getByRole("button", { name: "Cancel", exact: true }), "Cancel ingredient form");

    await page.getByPlaceholder("Search ingredients").fill(flourName);
    await flourCard.click();
    await page.getByRole("heading", { name: flourName, exact: true }).waitFor({ state: "visible" });
    await page.getByText(/4,800g/).first().waitFor({ state: "visible" });
    await page.getByText(/0\.50\/g/).first().waitFor({ state: "visible" });
    await clickVisible(page.getByRole("button", { name: "Adjust Stock", exact: true }), "Adjust Stock");
    await assertModalUsable(page, "Adjust Stock");
    await page.locator('input[name="quantity"]').fill("999999");
    await page.getByRole("alert").waitFor({ state: "visible" });
    const saveAdjustment = page.getByRole("button", { name: "Save Adjustment", exact: true });
    assert(await saveAdjustment.isDisabled(), "Oversized stock removal left Save Adjustment enabled.");
  } finally {
    await browser.close();
  }
}

async function main() {
  assertPrerequisites();
  const user = await login();
  assert(user.role === "Owner/Admin", `REGRESSION_AUDIT_SMOKE requires an Owner/Admin test account so temporary ingredients can be archived; received ${user.role}.`);
  const action = actionClient(user.token);
  const createdIngredientIds = [];
  const flourId = `ing-${runId}-flour`;
  const sugarId = `ing-${runId}-sugar`;
  const packagingId = `ing-${runId}-packaging`;
  const flourName = `AUDIT-Smoke Flour ${runId}`;
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  try {
    for (const ingredient of [
      {
        id: flourId,
        name: flourName,
        category: "Dry Goods",
        baseUnit: "g",
        purchaseUnit: "g",
        currentStock: 0,
        reorderLevel: 0,
        latestUnitCost: 0.5,
        purchaseQuantity: 5000,
        purchasePrice: 2500,
        expiryTrackingEnabled: true,
        expiryDate: tomorrow,
        notes: "Temporary regression audit smoke ingredient"
      },
      {
        id: sugarId,
        name: `AUDIT-Smoke Sugar ${runId}`,
        category: "Dry Goods",
        baseUnit: "g",
        purchaseUnit: "g",
        currentStock: 0,
        reorderLevel: 0,
        latestUnitCost: 0.64,
        purchaseQuantity: 1000,
        purchasePrice: 640,
        expiryTrackingEnabled: true,
        expiryDate: tomorrow,
        notes: "Temporary regression audit smoke ingredient"
      },
      {
        id: packagingId,
        name: `AUDIT-Smoke Packaging ${runId}`,
        category: "Packaging",
        baseUnit: "pcs",
        purchaseUnit: "pcs",
        currentStock: 0,
        reorderLevel: 0,
        latestUnitCost: 100,
        purchaseQuantity: 12,
        purchasePrice: 1200,
        notes: "Temporary regression audit smoke ingredient"
      }
    ]) {
      const result = await action("ingredient.save", { ingredient });
      createdIngredientIds.push(result.id);
    }

    let snapshot = await bootstrap(user.token);
    let flour = ingredientById(snapshot, flourId);
    const sugar = ingredientById(snapshot, sugarId);
    const packaging = ingredientById(snapshot, packagingId);
    let flourBatch = batchByIngredient(snapshot, flourId);

    assertNear(flour.latestUnitCost, 0.5, "Flour unit cost");
    assertNear(sugar.latestUnitCost, 0.64, "Sugar unit cost");
    assert(packaging.purchaseUnit === "pcs", `Packaging purchase unit expected pcs, received ${packaging.purchaseUnit}.`);
    assertNear(flour.currentStock, 5000, "Flour stock before FEFO removal");
    assertNear(flourBatch.quantityRemaining, 5000, "Flour FEFO lot before removal");

    await action("inventory.adjust", {
      ingredientId: flourId,
      movementType: "adjustment",
      quantityChange: -200,
      unit: "g",
      note: "Regression audit smoke FEFO removal"
    });

    snapshot = await bootstrap(user.token);
    flour = ingredientById(snapshot, flourId);
    flourBatch = batchByIngredient(snapshot, flourId);
    assertNear(flour.currentStock, 4800, "Flour stock after FEFO removal");
    assertNear(flourBatch.quantityRemaining, 4800, "Flour FEFO lot after removal");

    let rejectedOversizedRemoval = false;
    try {
      await action("inventory.adjust", {
        ingredientId: flourId,
        movementType: "adjustment",
        quantityChange: -999999,
        unit: "g",
        note: "Regression audit smoke oversized removal"
      });
    } catch (error) {
      rejectedOversizedRemoval = /stock negative/i.test(error.message);
    }
    assert(rejectedOversizedRemoval, "API did not reject oversized stock removal.");

    await runBrowserChecks(user, flourName);
    console.log(`Regression audit smoke passed against ${baseURL}. Temporary ingredients will be archived.`);
  } finally {
    for (const ingredientId of createdIngredientIds.reverse()) {
      try {
        await action("ingredient.delete", { ingredientId });
      } catch (error) {
        console.warn(`Cleanup failed for ${ingredientId}: ${error.message}`);
      }
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
