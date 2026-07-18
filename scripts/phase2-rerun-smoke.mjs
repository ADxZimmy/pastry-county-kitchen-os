import { config } from "dotenv";

config({ path: ".env.local" });
config();

const baseURL = process.env.PHASE2_RERUN_SMOKE_BASE_URL ?? process.env.LIVE_BASE_URL ?? "https://pastry-county-kitchen-os.vercel.app";
const email = process.env.LIVE_TEST_EMAIL;
const password = process.env.LIVE_TEST_PASSWORD;
const runId = `phase2-${Date.now()}`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertPrerequisites() {
  const missing = [];
  if (!email) missing.push("LIVE_TEST_EMAIL");
  if (!password) missing.push("LIVE_TEST_PASSWORD");
  if (missing.length) throw new Error(`Phase 2 rerun smoke prerequisites missing: ${missing.join(", ")}.`);
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

async function loginAs(loginEmail, loginPassword) {
  const { body } = await requestJson("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: loginEmail, password: loginPassword })
  });
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

async function assertAuthAndRevocation(owner) {
  const noToken = await requestJson("/api/bootstrap", {}, false);
  assert(noToken.response.status === 401, `Unauthenticated bootstrap expected 401, received ${noToken.response.status}.`);

  const action = actionClient(owner.token);
  const viewerEmail = `audit-rerun-viewer-${runId}@pastrycounty.com`;
  const viewerPassword = `Phase2-${runId}-Aa1!`;
  let viewerId = "";
  try {
    const created = await action("user.save", {
      user: {
        email: viewerEmail,
        fullName: `Audit Rerun Viewer ${runId}`,
        role: "Viewer",
        password: viewerPassword,
        active: true
      }
    });
    viewerId = created.id;
    const viewer = await loginAs(viewerEmail, viewerPassword);
    const viewerBootstrap = await requestJson("/api/bootstrap", {
      headers: { Authorization: `Bearer ${viewer.token}` }
    });
    assert(Array.isArray(viewerBootstrap.body.appUsers) && viewerBootstrap.body.appUsers.length === 0, "Viewer bootstrap exposed staff users.");
    assert(Array.isArray(viewerBootstrap.body.auditLogs) && viewerBootstrap.body.auditLogs.length === 0, "Viewer bootstrap exposed audit logs.");
    assert(!viewerBootstrap.body.settings?.lowStockNotificationEmail, "Viewer bootstrap exposed the low-stock notification email.");

    await action("user.revokeSessions", { userId: viewerId });
    const revoked = await requestJson("/api/bootstrap", {
      headers: { Authorization: `Bearer ${viewer.token}` }
    }, false);
    assert(revoked.response.status === 401, `Revoked viewer bootstrap expected 401, received ${revoked.response.status}.`);
  } finally {
    if (viewerId) {
      try {
        await action("user.disable", { userId: viewerId });
      } catch (error) {
        console.warn(`Temporary viewer cleanup failed: ${error.message}`);
      }
    }
  }
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

async function assertFreshLoginAndMobile() {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 320, height: 568 } });
  try {
    await page.goto(`${baseURL}/#login`, { waitUntil: "networkidle" });
    await page.getByPlaceholder("owner@pastrycounty.ng").fill(email);
    await page.getByPlaceholder("Password").fill(password);
    await page.getByRole("button", { name: /login/i }).click();
    await page.locator(".app-shell").waitFor({ state: "visible", timeout: 30000 });
    await page.getByRole("heading", { name: "Kitchen Command Center" }).first().waitFor({ state: "visible", timeout: 30000 });
    const storedSession = await page.evaluate(() => JSON.parse(window.localStorage.getItem("pastry-county-session") || "{}"));
    assert(storedSession.user?.token, "Fresh UI login did not persist user.token.");
    assert(!await page.getByText(/Session expired/i).isVisible().catch(() => false), "Fresh UI login showed Session expired.");

    // Phase 010 renamed the deterministic helper from "AI Assistant"/"Ask AI" to
    // "Kitchen Helper" (PCO-003 honest labelling).
    await page.getByRole("button", { name: "Kitchen Helper" }).click();
    await page.getByRole("heading", { name: "Kitchen Helper" }).waitFor({ state: "visible" });
    const prompts = [
      ["Convert 4 cups flour to grams.", "Flour: 4 cup -> 480g"],
      ["Convert 1 cup sugar to grams.", "Sugar: 1 cup -> 200g"],
      ["Convert 1 cup cocoa powder to grams.", "Cocoa Powder: 1 cup -> 85g"],
      ["Convert 4 large eggs to grams.", "Eggs: 4 egg -> 200g"],
      ["Convert 1 cup coconut oil to ml.", "Coconut Oil: 1 cup -> 240ml"]
    ];
    for (const [prompt, expected] of prompts) {
      await page.locator(".chat-composer textarea").fill(prompt);
      await page.getByRole("button", { name: /send/i }).click();
      await page.getByText(expected, { exact: false }).last().waitFor({ state: "visible", timeout: 10000 });
      assert(!await page.getByText(/1 g -> 1g/i).isVisible().catch(() => false), `AI prompt fell back to direct grams for ${prompt}`);
    }

    await page.getByRole("button", { name: "Production" }).click();
    await page.getByRole("heading", { name: "Production Plan" }).waitFor({ state: "visible" });
    await assertNoHorizontalOverflow(page, "Production");
    const mobileSemantics = await page.evaluate(() => ({
      invalidListItems: document.querySelectorAll(".mobile-table-cards [role='listitem']").length,
      headingLevels: Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6")).map((heading) => Number(heading.tagName.slice(1)))
    }));
    assert(mobileSemantics.invalidListItems === 0, "Mobile cards still use explicit listitem roles.");
    for (let index = 1; index < mobileSemantics.headingLevels.length; index += 1) {
      assert(mobileSemantics.headingLevels[index] <= mobileSemantics.headingLevels[index - 1] + 1, `Production heading order jumps from h${mobileSemantics.headingLevels[index - 1]} to h${mobileSemantics.headingLevels[index]}.`);
    }
  } finally {
    await browser.close();
  }
}

async function main() {
  assertPrerequisites();
  const owner = await loginAs(email, password);
  assert(owner.role === "Owner/Admin", `Phase 2 rerun smoke requires an Owner/Admin live test account; received ${owner.role}.`);
  await assertAuthAndRevocation(owner);
  await assertFreshLoginAndMobile();
  console.log(`Phase 2 rerun smoke passed against ${baseURL}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
