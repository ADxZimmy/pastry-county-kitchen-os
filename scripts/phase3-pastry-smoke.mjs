import { config } from "dotenv";

config({ path: ".env.local" });
config();

const baseURL = process.env.PHASE3_PASTRY_SMOKE_BASE_URL ?? process.env.LIVE_BASE_URL ?? "https://pastry-county-kitchen-os.vercel.app";
const email = process.env.LIVE_TEST_EMAIL;
const password = process.env.LIVE_TEST_PASSWORD;
const runId = `phase3-${Date.now()}`;
const recipeName = `AUDIT-Phase3-${runId}`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertPrerequisites() {
  const missing = [];
  if (!email) missing.push("LIVE_TEST_EMAIL");
  if (!password) missing.push("LIVE_TEST_PASSWORD");
  if (missing.length) throw new Error(`Phase 3 pastry smoke prerequisites missing: ${missing.join(", ")}.`);
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
  const { body } = await requestJson("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
  assert(body.token, "Login did not return a session token.");
  return body;
}

function actionClient(token) {
  return async function action(action, payload = {}) {
    const { body } = await requestJson("/api/actions", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, ...payload })
    });
    return body;
  };
}

async function bootstrap(token) {
  const { body } = await requestJson("/api/bootstrap", {
    headers: { Authorization: `Bearer ${token}` }
  });
  return body;
}

function findEggIngredient(snapshot) {
  return snapshot.ingredients.find((ingredient) => ingredient.id === "eggs")
    ?? snapshot.ingredients.find((ingredient) => /eggs?/i.test(ingredient.name) && ingredient.baseUnit === "pcs")
    ?? snapshot.ingredients.find((ingredient) => /eggs?/i.test(ingredient.name));
}

function recipePayload(eggIngredient) {
  return {
    name: recipeName,
    category: "Brownies",
    baseYieldQuantity: 4,
    yieldUnit: "pieces",
    notes: "Temporary Phase 3 pastry formula smoke recipe.",
    instructions: [
      "Whisk room-temperature eggs and sugar until glossy.",
      "Fold dry ingredients gently until no flour streaks remain.",
      "Bake until the top is glossy and the centre carries moist crumbs."
    ].join("\n"),
    formulaMetadata: {
      productFamily: "Brownie",
      formulaVersion: runId,
      panProfile: "9x13 tray",
      panCount: 1,
      fillGuidance: "Fill tray evenly to 2 cm depth",
      ovenTemperature: "170C fan",
      bakeTimeRange: "24-28 min",
      mixingMethod: "Melted brownie method",
      restWindow: "Rest batter 10 min",
      coolWindow: "Cool fully before cutting",
      targetDoneness: "Set edges, moist crumbs in centre",
      sensoryCheckpoints: "Glossy top, fudgy centre, no dry flour",
      storageServiceNotes: "Wrap airtight after cooling",
      testBakeStatus: "production_ready"
    },
    items: [
      {
        ingredientId: eggIngredient.id,
        quantity: 1,
        unit: eggIngredient.baseUnit === "pcs" ? "pcs" : "egg",
        wastePercentage: 0,
        notes: "Phase 3 egg scaling probe",
        prepState: {
          component: "Brownie base",
          stage: "Mix",
          sequence: 1,
          ingredientState: "Lightly beaten",
          temperatureState: "Room temperature",
          dividedUse: "All in batter",
          preparationNotes: "Whisk before adding to sugar",
          handlingWarning: "Do not overmix after flour is added"
        }
      }
    ]
  };
}

async function createAndVerifyApi(action, token) {
  await action("schema.ensure");
  const snapshot = await bootstrap(token);
  const eggIngredient = findEggIngredient(snapshot);
  assert(eggIngredient, "No egg ingredient was available for the Phase 3 pastry smoke.");

  const created = await action("recipe.save", { recipe: recipePayload(eggIngredient) });
  assert(created.id, "Recipe save did not return an id.");

  const nextSnapshot = await bootstrap(token);
  const recipe = nextSnapshot.recipes.find((item) => item.id === created.id);
  assert(recipe, "Saved Phase 3 recipe was not returned by bootstrap.");
  assert(recipe.formulaMetadata?.ovenTemperature === "170C fan", "Formula metadata oven temperature did not reload.");
  assert(recipe.formulaMetadata?.testBakeStatus === "production_ready", "Formula metadata test-bake status did not reload.");

  const recipeItem = nextSnapshot.recipeItems.find((item) => item.recipeId === created.id && item.ingredientId === eggIngredient.id);
  assert(recipeItem, "Saved Phase 3 recipe item was not returned by bootstrap.");
  assert(recipeItem.prepState?.ingredientState === "Lightly beaten", "Recipe item ingredient state did not reload.");
  assert(recipeItem.prepState?.temperatureState === "Room temperature", "Recipe item temperature state did not reload.");
  return created.id;
}

async function verifyUi() {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await page.goto(`${baseURL}/#login`, { waitUntil: "networkidle" });
    await page.getByPlaceholder("owner@pastrycounty.ng").fill(email);
    await page.getByPlaceholder("Password").fill(password);
    await page.getByRole("button", { name: /login/i }).click();
    await page.locator(".app-shell").waitFor({ state: "visible", timeout: 30000 });

    await page.goto(`${baseURL}/#recipes`, { waitUntil: "networkidle" });
    await page.getByPlaceholder("Search recipes").fill(recipeName);
    await page.getByText(recipeName, { exact: true }).first().click();
    await page.getByRole("heading", { name: recipeName }).waitFor({ state: "visible", timeout: 30000 });
    await page.getByText("Formula Profile").waitFor({ state: "visible", timeout: 10000 });
    await page.getByText("170C fan").waitFor({ state: "visible", timeout: 10000 });
    await page.getByText("Room temperature").waitFor({ state: "visible", timeout: 10000 });
    await page.getByText("Lightly beaten").waitFor({ state: "visible", timeout: 10000 });

    await page.getByRole("button", { name: /scale recipe/i }).first().click();
    await page.getByRole("heading", { name: "Scale Recipe" }).waitFor({ state: "visible", timeout: 10000 });
    await page.getByText("Egg scaling").waitFor({ state: "visible", timeout: 10000 });
    await page.getByText("Original 1pcs", { exact: false }).waitFor({ state: "visible", timeout: 10000 });
  } finally {
    await browser.close();
  }
}

async function main() {
  assertPrerequisites();
  const owner = await login();
  assert(owner.role === "Owner/Admin", `Phase 3 pastry smoke requires an Owner/Admin live test account; received ${owner.role}.`);
  const action = actionClient(owner.token);
  let recipeId = "";
  try {
    recipeId = await createAndVerifyApi(action, owner.token);
    await verifyUi();
  } finally {
    if (recipeId) {
      try {
        await action("recipe.delete", { recipeId });
      } catch (error) {
        console.warn(`Temporary Phase 3 recipe cleanup failed: ${error.message}`);
      }
    }
  }
  console.log(`Phase 3 pastry smoke passed against ${baseURL}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
