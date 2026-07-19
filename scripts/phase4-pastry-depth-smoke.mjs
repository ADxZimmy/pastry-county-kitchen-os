import { config } from "dotenv";
import { authHeaders, resolveSmokeSession, seedBrowserSession, sessionCookieFrom } from "./_smoke-session.mjs";

config({ path: ".env.local" });
config();

const baseURL = process.env.PHASE4_PASTRY_SMOKE_BASE_URL ?? process.env.LIVE_BASE_URL ?? "https://pastry-county-kitchen-os.vercel.app";
const email = process.env.LIVE_TEST_EMAIL;
const password = process.env.LIVE_TEST_PASSWORD;
const runId = `phase4-${Date.now()}`;
const ingredientName = `AUDIT-Smoke-Phase4-Flour-${runId}`;
const recipeName = `AUDIT-Smoke-Phase4-Brownie-${runId}`;
const customerName = `AUDIT Smoke Phase4 ${runId}`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertPrerequisites() {
  const missing = [];
  if (!email) missing.push("LIVE_TEST_EMAIL");
  if (!password) missing.push("LIVE_TEST_PASSWORD");
  if (missing.length) throw new Error(`Phase 4 pastry smoke prerequisites missing: ${missing.join(", ")}.`);
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
  // Uses the session the runner injected when part of the suite; signs in
  // only when this smoke is run on its own. Shared login throttling (RS-006)
  // makes one login per child an own-goal.
  return await resolveSmokeSession(baseURL, email, password, { label: "Phase 4 smoke" });
}

function actionClient(session) {
  return async function action(action, payload = {}) {
    const { body } = await requestJson("/api/actions", {
      method: "POST",
      headers: authHeaders(baseURL, session),
      body: JSON.stringify({ action, ...payload })
    });
    return body;
  };
}

async function bootstrap(session) {
  const { body } = await requestJson("/api/bootstrap", {
    headers: authHeaders(baseURL, session)
  });
  return body;
}

async function cleanupPreviousSmokeData(action, token) {
  const snapshot = await bootstrap(token);
  const staleOrders = snapshot.orders.filter((item) => item.customerName?.startsWith("AUDIT Smoke Phase4 "));
  const staleRecipes = snapshot.recipes.filter((item) => item.name?.startsWith("AUDIT-Smoke-Phase4-Brownie-"));
  const staleIngredients = snapshot.ingredients.filter((item) => item.name?.startsWith("AUDIT-Smoke-Phase4-Flour-"));
  const staleIngredientIds = new Set(staleIngredients.map((item) => item.id));
  const staleRules = snapshot.conversionRules.filter((item) => staleIngredientIds.has(item.ingredientId));

  for (const order of staleOrders) {
    try {
      await action("order.delete", { orderId: order.id });
    } catch (error) {
      console.warn(`Previous Phase 4 order cleanup failed: ${error.message}`);
    }
  }
  for (const recipe of staleRecipes) {
    try {
      await action("recipe.delete", { recipeId: recipe.id });
    } catch (error) {
      console.warn(`Previous Phase 4 recipe cleanup failed: ${error.message}`);
    }
  }
  for (const rule of staleRules) {
    try {
      await action("conversion.delete", { ruleId: rule.id });
    } catch (error) {
      console.warn(`Previous Phase 4 conversion cleanup failed: ${error.message}`);
    }
  }
  for (const ingredient of staleIngredients) {
    try {
      await action("ingredient.delete", { ingredientId: ingredient.id });
    } catch (error) {
      console.warn(`Previous Phase 4 ingredient cleanup failed: ${error.message}`);
    }
  }
}

async function createAndVerifyApi(action, token, ids) {
  await action("schema.ensure");

  const ingredient = await action("ingredient.save", {
    ingredient: {
      name: ingredientName,
      category: "Dry Goods",
      baseUnit: "g",
      purchaseUnit: "kg",
      currentStock: 1000,
      reorderLevel: 100,
      latestUnitCost: 2.5,
      notes: "Temporary Phase 4 pastry depth smoke ingredient.",
      allergenProfile: {
        contains: ["gluten"],
        mayContain: ["soy"],
        dietaryFlags: ["vegetarian"],
        crossContactRisk: "medium",
        labelNotes: "Shared dry goods shelf for live smoke verification."
      },
      storageProfile: {
        storageTemperature: "cool_dry",
        storageLocation: "Dry store smoke shelf",
        humiditySensitive: true,
        odorSensitive: true,
        openedShelfLifeDays: 14,
        handlingNotes: "Keep sealed after sifting."
      }
    }
  });
  assert(ingredient.id, "Ingredient save did not return an id.");
  ids.ingredientId = ingredient.id;

  const genericRule = await action("conversion.save", {
    rule: {
      ingredientId: ingredient.id,
      fromUnit: "cup",
      toUnit: "g",
      conversionFactor: 120,
      confidenceLevel: "High",
      source: "manual entry",
      verified: true
    }
  });
  if (genericRule.id) ids.conversionRuleIds = [...(ids.conversionRuleIds ?? []), genericRule.id];
  const scopedRule = await action("conversion.save", {
    rule: {
      ingredientId: ingredient.id,
      fromUnit: "cup",
      toUnit: "g",
      conversionFactor: 110,
      confidenceLevel: "High",
      source: "measured in kitchen",
      verified: true,
      ingredientState: "Sifted",
      temperatureState: "Room temperature",
      formulaContext: "Brownie"
    }
  });
  if (scopedRule.id) ids.conversionRuleIds = [...(ids.conversionRuleIds ?? []), scopedRule.id];
  assert(genericRule.id && scopedRule.id, "Conversion rule saves did not return ids.");

  const recipe = await action("recipe.save", {
    recipe: {
      name: recipeName,
      category: "Brownies",
      baseYieldQuantity: 4,
      yieldUnit: "pieces",
      notes: "Temporary Phase 4 smoke recipe.",
      instructions: [
        "Sift dry ingredients before mixing.",
        "Fold just until no dry flour remains.",
        "Bake until the top is glossy and the centre carries moist crumbs."
      ].join("\n"),
      formulaMetadata: {
        productFamily: "Brownie",
        formulaVersion: runId,
        panProfile: "Small test tray",
        ovenTemperature: "170C fan",
        bakeTimeRange: "22-25 min",
        mixingMethod: "Melted brownie method",
        targetDoneness: "Set edges, moist crumb centre",
        sensoryCheckpoints: "Glossy top, fudgy centre, no dry flour",
        storageServiceNotes: "Cool fully before wrapping",
        testBakeStatus: "production_ready"
      },
      costProfile: {
        laborMinutes: 30,
        laborRatePerHour: 1200,
        packagingCost: 500,
        overheadCost: 300,
        utilityCost: 200,
        failureAllowancePercentage: 5,
        yieldLossPercentage: 4,
        notes: "Phase 4 live smoke production costing profile."
      },
      items: [
        {
          ingredientId: ingredient.id,
          quantity: 1,
          unit: "cup",
          wastePercentage: 0,
          notes: "Scoped conversion should prefer sifted brownie density.",
          prepState: {
            component: "Brownie base",
            stage: "Dry mix",
            sequence: 1,
            ingredientState: "Sifted",
            temperatureState: "Room temperature",
            dividedUse: "All in batter",
            preparationNotes: "Sift immediately before folding.",
            handlingWarning: "Keep sealed after sifting."
          }
        }
      ]
    }
  });
  assert(recipe.id && recipe.productId, "Recipe save did not return ids.");
  ids.recipeId = recipe.id;

  const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const order = await action("order.save", {
    reserve: true,
    order: {
      customerName,
      customerPhone: "",
      dueDate,
      deliveryMethod: "Pickup",
      status: "Confirmed",
      paymentStatus: "Paid",
      notes: "Temporary Phase 4 smoke order.",
      items: [
        {
          productId: recipe.productId,
          recipeId: recipe.id,
          requestedYieldQuantity: 4,
          yieldUnit: "pieces",
          quantityMultiplier: 1
        }
      ]
    }
  });
  assert(order.id, "Order save did not return an id.");
  ids.orderId = order.id;
  assert(order.reservation?.reserved, `Order reservation failed: ${JSON.stringify(order.reservation ?? {})}.`);

  const produced = await action("order.produce", {
    orderId: order.id,
    qcLog: {
      recipeId: recipe.id,
      formulaVersion: runId,
      expectedYieldQuantity: 4,
      actualYieldQuantity: 3.75,
      yieldUnit: "pieces",
      roomTemperature: "25C",
      mixTemperature: "23C",
      ovenTemperature: "170C fan",
      bakeTimeMinutes: 24,
      restTimeMinutes: 15,
      sensoryNotes: "Glossy top, fudgy centre, clean edges.",
      defects: "",
      nextAdjustment: "Keep current bake window.",
      passedQc: true
    }
  });
  assert(produced.qcLogId, "Production completion did not return a QC log id.");

  const snapshot = await bootstrap(token);
  const savedIngredient = snapshot.ingredients.find((item) => item.id === ingredient.id);
  const savedRecipe = snapshot.recipes.find((item) => item.id === recipe.id);
  const savedItem = snapshot.recipeItems.find((item) => item.recipeId === recipe.id && item.ingredientId === ingredient.id);
  const savedOrder = snapshot.orders.find((item) => item.id === order.id);
  const savedQcLog = snapshot.productionQcLogs?.find((item) => item.orderId === order.id);
  const savedScopedRule = snapshot.conversionRules.find((item) => item.id === scopedRule.id);

  assert(savedIngredient?.allergenProfile?.contains?.includes("gluten"), "Ingredient allergen profile did not reload.");
  assert(savedIngredient?.storageProfile?.storageTemperature === "cool_dry", "Ingredient storage profile did not reload.");
  assert(savedRecipe?.costProfile?.failureAllowancePercentage === 5, "Recipe cost profile did not reload.");
  assert(savedRecipe?.formulaMetadata?.productFamily === "Brownie", "Recipe product family did not reload.");
  assert(savedItem?.prepState?.ingredientState === "Sifted", "Recipe prep state did not reload.");
  assert(savedScopedRule?.formulaContext === "Brownie", "Scoped conversion rule did not reload.");
  assert(savedOrder?.status === "Produced", "Order was not marked produced.");
  assert(savedQcLog?.actualYieldQuantity === 3.75, "Production QC log did not reload with actual yield.");
  assert(savedQcLog?.sensoryNotes?.includes("Glossy top"), "Production QC sensory notes did not reload.");

  return ids;
}

async function verifyUi(owner) {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await seedBrowserSession(page, baseURL, owner.sessionCookie, { route: { name: "dashboard" }, page: "dashboard" });
    await page.goto(`${baseURL}/#inventory`, { waitUntil: "networkidle" });
    await page.locator(".app-shell").waitFor({ state: "visible", timeout: 30000 });
    await page.getByPlaceholder("Search ingredients").fill(ingredientName);
    await page.getByText(ingredientName, { exact: true }).first().click();
    await page.getByRole("heading", { name: ingredientName }).first().waitFor({ state: "visible", timeout: 30000 });
    await page.getByText("Allergen Profile").waitFor({ state: "visible", timeout: 10000 });
    await page.getByText("gluten").waitFor({ state: "visible", timeout: 10000 });
    await page.getByText("cool dry").waitFor({ state: "visible", timeout: 10000 });
    await page.getByText("Dry store smoke shelf").waitFor({ state: "visible", timeout: 10000 });

    await page.goto(`${baseURL}/#recipes`, { waitUntil: "networkidle" });
    await page.getByPlaceholder("Search recipes").fill(recipeName);
    await page.getByText(recipeName, { exact: true }).first().click();
    await page.getByRole("heading", { name: recipeName }).first().waitFor({ state: "visible", timeout: 30000 });
    await page.getByText("Production Cost Profile").waitFor({ state: "visible", timeout: 10000 });
    await page.getByText("Non-ingredient costs").waitFor({ state: "visible", timeout: 10000 });
    await page.getByText("5% failure allowance", { exact: false }).waitFor({ state: "visible", timeout: 10000 });
    await page.getByText("Sifted").waitFor({ state: "visible", timeout: 10000 });

    await page.goto(`${baseURL}/#orders`, { waitUntil: "networkidle" });
    await page.getByPlaceholder("Search orders").fill(customerName);
    await page.getByText(customerName, { exact: true }).first().click();
    await page.getByRole("heading", { name: customerName }).first().waitFor({ state: "visible", timeout: 30000 });
    await page.getByText("Production QC Logs").waitFor({ state: "visible", timeout: 10000 });
    await page.getByText("QC passed", { exact: false }).waitFor({ state: "visible", timeout: 10000 });
    await page.getByText("Glossy top", { exact: false }).waitFor({ state: "visible", timeout: 10000 });
  } finally {
    await browser.close();
  }
}

async function cleanup(action, ids) {
  if (ids.orderId) {
    try {
      await action("order.delete", { orderId: ids.orderId });
    } catch (error) {
      console.warn(`Temporary Phase 4 order cleanup failed: ${error.message}`);
    }
  }
  if (ids.recipeId) {
    try {
      await action("recipe.delete", { recipeId: ids.recipeId });
    } catch (error) {
      console.warn(`Temporary Phase 4 recipe cleanup failed: ${error.message}`);
    }
  }
  for (const ruleId of ids.conversionRuleIds ?? []) {
    try {
      await action("conversion.delete", { ruleId });
    } catch (error) {
      console.warn(`Temporary Phase 4 conversion cleanup failed: ${error.message}`);
    }
  }
  if (ids.ingredientId) {
    try {
      await action("ingredient.delete", { ingredientId: ids.ingredientId });
    } catch (error) {
      console.warn(`Temporary Phase 4 ingredient cleanup failed: ${error.message}`);
    }
  }
}

async function main() {
  assertPrerequisites();
  const owner = await login();
  assert(owner.role === "Owner/Admin", `Phase 4 pastry smoke requires an Owner/Admin live test account; received ${owner.role}.`);
  const action = actionClient(owner);
  const ids = { conversionRuleIds: [] };
  try {
    await cleanupPreviousSmokeData(action, owner);
    await createAndVerifyApi(action, owner, ids);
    await verifyUi(owner);
  } finally {
    await cleanup(action, ids);
  }
  console.log(`Phase 4 pastry depth smoke passed against ${baseURL}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
