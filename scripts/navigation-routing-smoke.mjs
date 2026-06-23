import { config } from "dotenv";

config({ path: ".env.local" });
config();

const baseURL = process.env.NAVIGATION_ROUTING_SMOKE_BASE_URL ?? process.env.LIVE_BASE_URL ?? "https://pastry-county-kitchen-os.vercel.app";
const email = process.env.LIVE_TEST_EMAIL;
const password = process.env.LIVE_TEST_PASSWORD;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertPrerequisites() {
  const missing = [];
  if (!email) missing.push("LIVE_TEST_EMAIL");
  if (!password) missing.push("LIVE_TEST_PASSWORD");
  if (missing.length) throw new Error(`Navigation routing smoke prerequisites missing: ${missing.join(", ")}.`);
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    throw new Error("Playwright is not installed. Run `npm install -D playwright` and `npx playwright install chromium` before this smoke test.");
  }
}

async function requestJson(path, options = {}, expectedOk = true) {
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
  if (expectedOk && !response.ok) throw new Error(body.error || body.raw || `${path} returned ${response.status}.`);
  return { response, body };
}

async function login() {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { response, body } = await requestJson("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    }, false);
    if (response.ok) {
      assert(body.token, "Login did not return a session token.");
      return body;
    }
    if (response.status === 429 && attempt < 2) {
      const retryAfter = Number(response.headers.get("Retry-After") || "60");
      console.log(`Navigation smoke login was rate-limited; waiting ${retryAfter}s before retrying.`);
      await new Promise((resolve) => setTimeout(resolve, (retryAfter + 1) * 1000));
      continue;
    }
    throw new Error(body.error || `Login failed with ${response.status}.`);
  }
  throw new Error("Login failed after rate-limit retries.");
}

async function bootstrap(token) {
  const { body } = await requestJson("/api/bootstrap", {
    headers: { Authorization: `Bearer ${token}` }
  });
  return body;
}

async function seedUiSession(page, owner) {
  await page.addInitScript((session) => {
    window.localStorage.setItem("pastry-county-session", JSON.stringify(session));
  }, { route: { name: "dashboard" }, page: "dashboard", user: owner });
  await page.goto(`${baseURL}/#dashboard`, { waitUntil: "networkidle" });
  await page.locator(".app-shell").waitFor({ state: "visible", timeout: 30000 });
  await page.getByRole("heading", { name: "Kitchen Command Center" }).waitFor({ state: "visible", timeout: 30000 });
}

async function assertHash(page, expectedHash) {
  const hash = await page.evaluate(() => window.location.hash);
  assert(hash === expectedHash, `Expected hash ${expectedHash}, received ${hash}.`);
}

async function assertNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => ({
    htmlOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    bodyOverflow: document.body.scrollWidth > window.innerWidth + 1,
    htmlWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    viewport: window.innerWidth
  }));
  assert(!overflow.htmlOverflow && !overflow.bodyOverflow, `${label} overflowed at ${overflow.viewport}px: html ${overflow.htmlWidth}, body ${overflow.bodyWidth}.`);
}

function pickRecords(snapshot) {
  const recipe = snapshot.recipes.find((item) => item.active !== false) ?? snapshot.recipes[0];
  const ingredient = snapshot.ingredients.find((item) => item.active !== false) ?? snapshot.ingredients[0];
  const order = snapshot.orders.find((item) => !["Produced", "Delivered", "Cancelled"].includes(item.status)) ?? snapshot.orders[0];
  assert(recipe, "No recipe available for navigation smoke.");
  assert(ingredient, "No ingredient available for navigation smoke.");
  assert(order, "No order available for navigation smoke.");
  return { recipe, ingredient, order };
}

async function verifyRecipeRoutes(page, recipe) {
  await page.goto(`${baseURL}/#recipes/${encodeURIComponent(recipe.id)}`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: recipe.name }).first().waitFor({ state: "visible", timeout: 30000 });
  await assertHash(page, `#recipes/${encodeURIComponent(recipe.id)}`);

  await page.getByRole("button", { name: /edit recipe/i }).click();
  await page.getByRole("heading", { name: `Edit ${recipe.name}` }).waitFor({ state: "visible", timeout: 10000 });
  await assertHash(page, `#recipes/${encodeURIComponent(recipe.id)}/edit`);
  await page.getByRole("button", { name: /back to recipe/i }).first().click();
  await page.getByRole("heading", { name: recipe.name }).first().waitFor({ state: "visible", timeout: 10000 });
  await assertHash(page, `#recipes/${encodeURIComponent(recipe.id)}`);

  await page.getByRole("button", { name: /^scale recipe$/i }).first().click();
  await page.getByRole("heading", { name: `Scale ${recipe.name}` }).waitFor({ state: "visible", timeout: 10000 });
  await assertHash(page, `#recipes/${encodeURIComponent(recipe.id)}/scale`);
  await page.getByRole("button", { name: /back to recipe detail/i }).click();
  await page.getByRole("heading", { name: recipe.name }).first().waitFor({ state: "visible", timeout: 10000 });
  await assertHash(page, `#recipes/${encodeURIComponent(recipe.id)}`);
}

async function verifyUnsavedGuard(page) {
  await page.goto(`${baseURL}/#recipes/new`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Add Recipe" }).waitFor({ state: "visible", timeout: 10000 });
  await page.getByLabel("Product name").fill(`Unsaved Smoke ${Date.now()}`);
  await page.getByRole("button", { name: "Back to Recipes" }).first().click();
  await page.getByRole("heading", { name: "Discard unsaved changes?" }).waitFor({ state: "visible", timeout: 10000 });
  await page.getByRole("button", { name: "Keep it" }).click();
  await assertHash(page, "#recipes/new");
  await page.getByRole("button", { name: "Back to Recipes" }).first().click();
  await page.getByRole("button", { name: "Leave Page" }).click();
  await page.getByRole("heading", { name: "Recipe Library" }).waitFor({ state: "visible", timeout: 10000 });
  await assertHash(page, "#recipes");
}

async function verifyInventoryRoutes(page, ingredient) {
  await page.goto(`${baseURL}/#inventory/${encodeURIComponent(ingredient.id)}`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: ingredient.name }).first().waitFor({ state: "visible", timeout: 30000 });
  await assertHash(page, `#inventory/${encodeURIComponent(ingredient.id)}`);
  await page.getByRole("button", { name: new RegExp(`edit ${ingredient.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i") }).click();
  await page.getByRole("heading", { name: `Edit ${ingredient.name}` }).waitFor({ state: "visible", timeout: 10000 });
  await assertHash(page, `#inventory/${encodeURIComponent(ingredient.id)}/edit`);
  await page.getByRole("button", { name: /back to ingredient/i }).first().click();
  await page.getByRole("heading", { name: ingredient.name }).first().waitFor({ state: "visible", timeout: 10000 });
}

async function verifyOrderRoutes(page, order) {
  await page.goto(`${baseURL}/#orders/${encodeURIComponent(order.id)}`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: `${order.customerName} Order` }).first().waitFor({ state: "visible", timeout: 30000 });
  await assertHash(page, `#orders/${encodeURIComponent(order.id)}`);
  const edit = page.getByRole("button", { name: /edit order/i });
  if (await edit.isEnabled().catch(() => false)) {
    await edit.click();
    await page.getByRole("heading", { name: `Edit ${order.customerName} Order` }).waitFor({ state: "visible", timeout: 10000 });
    await assertHash(page, `#orders/${encodeURIComponent(order.id)}/edit`);
    await page.getByRole("button", { name: /back to order/i }).first().click();
    await page.getByRole("heading", { name: `${order.customerName} Order` }).first().waitFor({ state: "visible", timeout: 10000 });
  }
}

async function verifyReturnContext(page) {
  await page.goto(`${baseURL}/#shopping?returnTo=production`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Shopping List" }).waitFor({ state: "visible", timeout: 30000 });
  await page.getByText("Workflow return").waitFor({ state: "visible", timeout: 10000 });
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("heading", { name: "Production Plan" }).waitFor({ state: "visible", timeout: 10000 });
  await assertHash(page, "#production");
}

async function verifyMobileNavigation(page) {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(`${baseURL}/#dashboard`, { waitUntil: "networkidle" });
  await page.locator(".app-shell").waitFor({ state: "visible", timeout: 30000 });
  const bottomNavLabels = await page.locator(".bottom-nav button span").evaluateAll((nodes) => nodes.map((node) => node.textContent?.trim()));
  assert(bottomNavLabels.length === 5, `Expected 5 bottom nav items, received ${bottomNavLabels.length}: ${bottomNavLabels.join(", ")}.`);
  for (const label of ["Dashboard", "Inventory", "Orders", "Production", "More"]) {
    assert(bottomNavLabels.includes(label), `Bottom nav missing ${label}.`);
  }
  await assertNoHorizontalOverflow(page, "Mobile dashboard navigation");
  await page.getByRole("button", { name: /more/i }).click();
  await page.getByRole("heading", { name: "More & Settings" }).waitFor({ state: "visible", timeout: 10000 });
  await assertNoHorizontalOverflow(page, "Mobile More navigation");
}

async function main() {
  assertPrerequisites();
  const owner = await login();
  assert(owner.role === "Owner/Admin", `Navigation routing smoke requires an Owner/Admin live test account; received ${owner.role}.`);
  const snapshot = await bootstrap(owner.token);
  const records = pickRecords(snapshot);
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  try {
    await seedUiSession(page, owner);
    await verifyRecipeRoutes(page, records.recipe);
    await verifyUnsavedGuard(page);
    await verifyInventoryRoutes(page, records.ingredient);
    await verifyOrderRoutes(page, records.order);
    await verifyReturnContext(page);
    await verifyMobileNavigation(page);
  } finally {
    await browser.close();
  }
  console.log(`Navigation routing smoke passed against ${baseURL}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
