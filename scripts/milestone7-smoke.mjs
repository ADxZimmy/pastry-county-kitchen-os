import { config } from "dotenv";
import { resolveSmokeSession, seedBrowserSession, sessionCookieFrom } from "./_smoke-session.mjs";

config({ path: ".env.local" });
config();

const baseURL = process.env.MILESTONE7_SMOKE_BASE_URL ?? process.env.LIVE_BASE_URL ?? "https://pastry-county-kitchen-os.vercel.app";
const email = process.env.LIVE_TEST_EMAIL;
const password = process.env.LIVE_TEST_PASSWORD;
const allowMutations = process.env.MILESTONE7_SMOKE_MUTATE === "1";

function assertPrerequisites() {
  const missing = [];
  if (!email) missing.push("LIVE_TEST_EMAIL");
  if (!password) missing.push("LIVE_TEST_PASSWORD");
  if (missing.length) {
    throw new Error(`Milestone 7 smoke prerequisites missing: ${missing.join(", ")}. Add the live test credentials to .env.local, then run npm run smoke:milestone7.`);
  }
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    throw new Error("Playwright is not installed. Run `npm install -D playwright` and `npx playwright install chromium` before this smoke test.");
  }
}

async function login() {
  // Uses the session the runner injected when part of the suite; signs in
  // only when this smoke is run on its own. Shared login throttling (RS-006)
  // makes one login per child an own-goal.
  return await resolveSmokeSession(baseURL, email, password, { label: "Milestone 7 smoke" });
}

async function clickVisible(locator, label) {
  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    const item = locator.nth(index);
    if (await item.isVisible()) {
      try {
        await item.click({ timeout: 3000 });
      } catch {
        await item.click({ force: true });
      }
      return;
    }
  }
  throw new Error(`No visible control found for ${label}.`);
}

async function hasVisible(locator) {
  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    if (await locator.nth(index).isVisible()) return true;
  }
  return false;
}

async function clickByText(page, text) {
  const button = page.getByRole("button", { name: text, exact: true });
  if (await button.count()) {
    await clickVisible(button, text);
    return;
  }
  await clickVisible(page.getByText(text, { exact: true }), text);
}

async function safeClickByText(page, text) {
  const target = page.getByText(text, { exact: true }).first();
  if (await target.count()) await target.click();
}

async function clickFirstVisible(page, selector, label) {
  await clickVisible(page.locator(selector), label);
}

async function openPage(page, label) {
  await clickByText(page, label);
  await page.waitForLoadState("networkidle");
}

async function assertNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (overflow) throw new Error(`${label} has horizontal overflow at ${await page.viewportSize()?.width}px.`);
}

async function assertStickyActionsReachable(page, label) {
  const actions = page.locator(".sticky-actions").first();
  if (!(await actions.count())) return;
  const box = await actions.boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport || box.y + box.height > viewport.height) {
    throw new Error(`${label} sticky actions are not fully reachable in the viewport.`);
  }
}

async function main() {
  assertPrerequisites();
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  try {
    const user = await login();
    await seedBrowserSession(page, baseURL, user.sessionCookie, { page: "dashboard" });
    await page.goto(`${baseURL}/#dashboard`, { waitUntil: "networkidle" });
    await page.locator(".app-shell").waitFor({ state: "visible", timeout: 30000 });
    await page.getByRole("heading", { name: "Kitchen Command Center" }).first().waitFor({ state: "visible", timeout: 30000 });

    await openPage(page, "Inventory");
    await assertNoHorizontalOverflow(page, "Inventory");
    await clickByText(page, "Add Ingredient");
    await assertStickyActionsReachable(page, "Ingredient form");
    const purchaseUnitSelect = page.locator('select[name="purchaseUnit"]');
    await purchaseUnitSelect.selectOption("pcs");
    const selectedPurchaseUnit = await purchaseUnitSelect.inputValue();
    if (selectedPurchaseUnit !== "pcs") {
      throw new Error(`Purchase unit selector did not change to pcs; current value is ${selectedPurchaseUnit}.`);
    }
    await clickByText(page, "Back to Inventory");
    if (await page.getByRole("heading", { name: "Discard unsaved changes?" }).isVisible().catch(() => false)) {
      await clickVisible(page.getByRole("button", { name: "Leave Page", exact: true }), "leave dirty ingredient form");
    }
    await clickFirstVisible(page, ".mobile-table-cards .item-card, .responsive-table tbody tr", "first inventory ingredient");
    await clickByText(page, "Adjust Stock");
    await page.locator('input[name="quantity"]').fill("999999999");
    const saveAdjustmentButton = page.getByRole("button", { name: "Save Adjustment", exact: true });
    if (!(await saveAdjustmentButton.isDisabled())) {
      throw new Error("Oversized stock removal left Save Adjustment enabled.");
    }
    await page.getByRole("alert").waitFor({ state: "visible" });
    await clickVisible(page.getByRole("button", { name: "Cancel", exact: true }), "cancel stock adjustment");

    await openPage(page, "Production");
    await assertNoHorizontalOverflow(page, "Production");
    const shortageText = page.getByText(/Resolve before production|Shortage/i).first();
    if (await shortageText.count()) await shortageText.waitFor({ state: "visible" });
    const shortageBatch = page.locator(".item-card", { hasText: /Resolve before production/i }).first();
    if (await shortageBatch.count()) {
      const startBatch = shortageBatch.getByRole("button", { name: "Start Batch", exact: true });
      const completeBatch = shortageBatch.getByRole("button", { name: "Complete Batch", exact: true });
      if (await startBatch.count() && !(await startBatch.isDisabled())) {
        throw new Error("Shortage batch left Start Batch enabled.");
      }
      if (await completeBatch.count() && !(await completeBatch.isDisabled())) {
        throw new Error("Shortage batch left Complete Batch enabled.");
      }
    }
    await safeClickByText(page, "Review Batch");
    if (await page.getByRole("dialog").isVisible().catch(() => false)) {
      await clickVisible(page.getByRole("button", { name: "Close", exact: true }), "close production review");
    }

    await openPage(page, "More");
    await openPage(page, "Shopping");
    await page.getByText("Suggested Purchases", { exact: true }).waitFor({ state: "visible" });
    await assertNoHorizontalOverflow(page, "Shopping");
    const shoppingToggle = page.getByText(/select all|clear all/i);
    if (await hasVisible(shoppingToggle)) {
      await clickVisible(shoppingToggle, "shopping select toggle");
    } else {
      await page.locator(".empty-note, .section-note, .warning-card").first().waitFor({ state: "visible" });
    }
    if (allowMutations && await hasVisible(page.getByRole("button", { name: /mark selected purchased/i }))) {
      await clickVisible(page.getByRole("button", { name: /mark selected purchased/i }), "mark selected purchased");
      await page.getByRole("status").waitFor({ state: "visible" });
    }

    await openPage(page, "More");
    await openPage(page, "Recipes");
    await openPage(page, "More");
    await openPage(page, "Costing");
    await openPage(page, "More");
    await openPage(page, "Conversions");
    await assertNoHorizontalOverflow(page, "Conversion library");
    await clickByText(page, "Edit");
    await assertStickyActionsReachable(page, "Conversion modal");
    await safeClickByText(page, "Cancel");

    await openPage(page, "More");
    await openPage(page, "Settings");
    await assertNoHorizontalOverflow(page, "Settings");
    await assertStickyActionsReachable(page, "Settings form");

    await openPage(page, "Recipes");
    await page.getByText("Scale Recipe", { exact: true }).first().click();
    await assertNoHorizontalOverflow(page, "Scaling");
    if (allowMutations) {
      await page.getByRole("button", { name: /create order/i }).click();
      await page.getByRole("status").waitFor({ state: "visible" });
    }

    console.log(`Milestone 7 smoke passed against ${baseURL}. Mutations ${allowMutations ? "enabled" : "skipped"}.`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
