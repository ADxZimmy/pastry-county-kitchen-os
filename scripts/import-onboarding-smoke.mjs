import { config } from "dotenv";
import { seedBrowserSession, sessionCookieFrom } from "./_smoke-session.mjs";

config({ path: ".env.local" });
config();

const baseURL = process.env.IMPORT_ONBOARDING_SMOKE_BASE_URL ?? process.env.LIVE_BASE_URL ?? "https://pastry-county-kitchen-os.vercel.app";
const email = process.env.LIVE_TEST_EMAIL;
const password = process.env.LIVE_TEST_PASSWORD;
const runId = Date.now().toString(36);
const recipeName = `AUDIT-Import-Onboarding-${runId}`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertPrerequisites() {
  const missing = [];
  if (!email) missing.push("LIVE_TEST_EMAIL");
  if (!password) missing.push("LIVE_TEST_PASSWORD");
  if (missing.length) throw new Error(`Import onboarding smoke prerequisites missing: ${missing.join(", ")}.`);
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
      return { ...body, sessionCookie: sessionCookieFrom(response, baseURL) };
    }
    if (response.status === 429 && attempt < 2) {
      const retryAfter = Number(response.headers.get("Retry-After") || "60");
      console.log(`Import smoke login was rate-limited; waiting ${retryAfter}s before retrying.`);
      await new Promise((resolve) => setTimeout(resolve, (retryAfter + 1) * 1000));
      continue;
    }
    throw new Error(body.error || `Login failed with ${response.status}.`);
  }
  throw new Error("Login failed after rate-limit retries.");
}

async function action(token, actionName, payload = {}) {
  const { body } = await requestJson("/api/actions", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: actionName, ...payload })
  });
  return body;
}

async function bootstrap(token) {
  const { body } = await requestJson("/api/bootstrap", {
    headers: { Authorization: `Bearer ${token}` }
  });
  return body;
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    throw new Error("Playwright is not installed. Run `npm install -D playwright` and `npx playwright install chromium` before this smoke test.");
  }
}

async function seedUiSession(page, owner) {
  await seedBrowserSession(page, baseURL, owner.sessionCookie, { route: { name: "imports" }, page: "imports" });
  await page.goto(`${baseURL}/#imports`, { waitUntil: "networkidle" });
  await page.locator(".app-shell").waitFor({ state: "visible", timeout: 30000 });
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

function importText() {
  return [
    `Recipe: ${recipeName}`,
    "Category: Brownies",
    "Yield: 12 pieces",
    "Ingredients:",
    "240 g flour | package quantity: 1000 | package price: 500 | line amount: 120",
    "360 g sugar | package quantity: 1000 | package price: 640 | line amount: 230.4",
    "3 pcs eggs | line amount: 480",
    "Instructions:",
    "Mix imported batter gently.",
    "Bake until the center is just set."
  ].join("\n");
}

async function verifyApiImport(token) {
  const extracted = await action(token, "import.extract", {
    source: {
      name: `${recipeName}.txt`,
      type: "text",
      text: importText()
    }
  });
  assert(extracted.counts?.recipes === 1, `Expected one extracted recipe, got ${JSON.stringify(extracted.counts)}.`);
  assert(extracted.recipes?.[0]?.items?.length === 3, "Expected three extracted recipe items.");
  assert(extracted.recipes[0].items.every((item) => item.needsReview === false), "Expected all recipe lines to match existing ingredients.");

  const committed = await action(token, "import.commit", { draft: extracted });
  const createdRecipe = committed.createdRecipes?.[0];
  assert(createdRecipe?.id, "Import commit did not create a recipe.");

  const snapshot = await bootstrap(token);
  const recipe = snapshot.recipes.find((item) => item.id === createdRecipe.id);
  assert(recipe, "Imported recipe was not returned by bootstrap.");
  assert(recipe.name === recipeName, `Imported recipe name mismatch: ${recipe?.name}.`);
  const item = snapshot.recipeItems.find((candidate) => candidate.recipeId === createdRecipe.id && candidate.ingredientId === "flour");
  assert(item?.prepState?.sourceLineAmount === 120, "Imported source line amount did not reload for flour.");
  assert(item?.prepState?.sourceFile === `${recipeName}.txt`, "Imported source file metadata did not reload.");

  return createdRecipe.id;
}

async function verifyUi(owner) {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 860 } });
    await seedUiSession(page, owner);
    await page.getByRole("heading", { name: /bring existing recipes/i }).waitFor({ state: "visible", timeout: 30000 });
    await assertNoHorizontalOverflow(page, "Import page");
    await page.getByRole("button", { name: /csv template/i }).waitFor({ state: "visible", timeout: 10000 });
  } finally {
    await browser.close();
  }
}

async function main() {
  assertPrerequisites();
  const owner = await login();
  let recipeId = "";
  try {
    recipeId = await verifyApiImport(owner.token);
    await verifyUi(owner);
    console.log(`Import onboarding smoke passed against ${baseURL}.`);
  } finally {
    if (recipeId) {
      try {
        await action(owner.token, "recipe.delete", { recipeId });
        console.log(`Archived temporary import recipe ${recipeId}.`);
      } catch (error) {
        console.warn(`Temporary import recipe cleanup failed: ${error.message}`);
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

