import { config } from "dotenv";

config({ path: ".env.local" });
config();

const baseURL = process.env.MILESTONE7_SMOKE_BASE_URL ?? process.env.LIVE_BASE_URL ?? "https://pastry-county-kitchen-os.vercel.app";
const email = process.env.LIVE_TEST_EMAIL;
const password = process.env.LIVE_TEST_PASSWORD;
const allowMutations = process.env.MILESTONE7_SMOKE_MUTATE === "1";

function requiredEnv(name, value) {
  if (!value) throw new Error(`${name} is required for the Milestone 7 smoke run.`);
  return value;
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    throw new Error("Playwright is not installed. Run `npm install -D playwright` and `npx playwright install chromium` before this smoke test.");
  }
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
  requiredEnv("LIVE_TEST_EMAIL", email);
  requiredEnv("LIVE_TEST_PASSWORD", password);
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  try {
    await page.goto(baseURL, { waitUntil: "networkidle" });
    await safeClickByText(page, "I already have an account");
    await page.getByPlaceholder("owner@pastrycounty.ng").fill(email);
    await page.getByPlaceholder("Password").fill(password);
    await page.getByRole("button", { name: /login/i }).click();
    await page.getByText("Pastry County Kitchen OS").first().waitFor({ state: "visible" });

    await openPage(page, "Inventory");
    await assertNoHorizontalOverflow(page, "Inventory");
    await clickByText(page, "Add Ingredient");
    await assertStickyActionsReachable(page, "Ingredient form");
    await clickByText(page, "Cancel");

    await openPage(page, "Production");
    await assertNoHorizontalOverflow(page, "Production");
    const shortageText = page.getByText(/Resolve before production|Shortage/i).first();
    if (await shortageText.count()) await shortageText.waitFor({ state: "visible" });
    await safeClickByText(page, "Review Batch");
    if (await page.getByRole("dialog").isVisible().catch(() => false)) {
      await clickVisible(page.getByRole("button", { name: "Close", exact: true }), "close production review");
    }

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
