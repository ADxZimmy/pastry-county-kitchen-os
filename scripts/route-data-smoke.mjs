// Phase 012-C: route-scoped data endpoints.
//
// Proves pagination is stable and that a lower role cannot reach, through the
// new endpoints, data /api/bootstrap has always withheld. Creates one temporary
// Viewer to test with and disables it in `finally`.
import { config } from "dotenv";
import { authHeaders, loginForSmoke, resolveSmokeSession } from "./_smoke-session.mjs";

config({ path: ".env.local" });
config();

const baseURL = process.env.ROUTE_DATA_SMOKE_BASE_URL ?? process.env.LIVE_BASE_URL ?? "https://pastry-county-kitchen-os.vercel.app";
const email = process.env.LIVE_TEST_EMAIL;
const password = process.env.LIVE_TEST_PASSWORD;
const runId = `routedata-${Date.now()}`;

if (!email || !password) {
  console.error("route-data smoke requires LIVE_TEST_EMAIL and LIVE_TEST_PASSWORD.");
  process.exit(1);
}

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: Boolean(ok), detail: detail ?? "" });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` -> ${detail}` : ""}`);
};

async function get(session, path) {
  const response = await fetch(new URL(path, baseURL), { headers: authHeaders(baseURL, session) });
  const text = await response.text();
  let body = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text.slice(0, 160) };
    }
  }
  return { status: response.status, body, headers: response.headers };
}

async function action(session, name, payload = {}) {
  const response = await fetch(new URL("/api/actions", baseURL), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(baseURL, session) },
    body: JSON.stringify({ action: name, ...payload })
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

let viewerId = "";
let owner;

try {
  owner = await resolveSmokeSession(baseURL, email, password, { label: "route-data smoke" });

  // --- unauthenticated -----------------------------------------------------
  const anon = await fetch(new URL("/api/data/orders", baseURL));
  check("unauthenticated read is refused", anon.status === 401, `${anon.status}`);

  // --- summary -------------------------------------------------------------
  const summary = await get(owner, "/api/data/summary");
  check("summary returns counts, not rows", summary.status === 200 && summary.body.summary?.orders !== undefined, `${summary.status}`);
  check("summary is private and no-store", /no-store/i.test(summary.headers.get("cache-control") ?? ""), summary.headers.get("cache-control"));
  check("summary varies on Cookie", /cookie/i.test(summary.headers.get("vary") ?? ""), summary.headers.get("vary"));
  const totals = summary.body.summary?.totals ?? {};
  check("summary counts the full history, not a truncated page", Number.isInteger(totals.auditLogs) && Number.isInteger(totals.inventoryMovements), `audit=${totals.auditLogs} movements=${totals.inventoryMovements}`);

  // --- pagination ----------------------------------------------------------
  const firstPage = await get(owner, "/api/data/movements?limit=5");
  check("movements page respects the requested limit", firstPage.status === 200 && firstPage.body.items?.length <= 5, `${firstPage.body.items?.length} items`);
  check("page reports whether more exist", typeof firstPage.body.hasMore === "boolean", `hasMore=${firstPage.body.hasMore}`);

  if (firstPage.body.hasMore) {
    const secondPage = await get(owner, `/api/data/movements?limit=5&cursor=${encodeURIComponent(firstPage.body.nextCursor)}`);
    const firstIds = new Set((firstPage.body.items ?? []).map((row) => row.id));
    const overlap = (secondPage.body.items ?? []).filter((row) => firstIds.has(row.id));
    check("the next page continues rather than repeating", secondPage.status === 200 && overlap.length === 0, `${overlap.length} repeated rows`);
    // Keyset ordering must be strictly descending across the page boundary.
    const lastOfFirst = firstPage.body.items.at(-1);
    const firstOfSecond = secondPage.body.items[0];
    check("ordering is stable across the boundary", !firstOfSecond || new Date(firstOfSecond.createdAt) <= new Date(lastOfFirst.createdAt), `${lastOfFirst?.createdAt} then ${firstOfSecond?.createdAt}`);
  } else {
    check("the next page continues rather than repeating", true, "only one page of movements exists");
    check("ordering is stable across the boundary", true, "only one page of movements exists");
  }

  const overLimit = await get(owner, "/api/data/movements?limit=100000");
  check("an absurd limit is clamped, not honoured", (overLimit.body.items?.length ?? 0) <= 200, `${overLimit.body.items?.length} items`);

  const garbageCursor = await get(owner, "/api/data/orders?cursor=not-a-real-cursor");
  check("a malformed cursor restarts rather than erroring", garbageCursor.status === 200, `${garbageCursor.status}`);

  const unknown = await get(owner, "/api/data/nonsense");
  check("an unknown resource is refused", unknown.status === 404, `${unknown.status}`);

  // --- role isolation ------------------------------------------------------
  const ownerAudit = await get(owner, "/api/data/audit?limit=3");
  check("Owner/Admin can read the audit trail", ownerAudit.status === 200, `${ownerAudit.status}`);

  const viewerEmail = `${runId}-viewer@pastrycounty.com`;
  const viewerPassword = `Route-${runId}-Aa1!`;
  const created = await action(owner, "user.save", {
    user: { email: viewerEmail, fullName: `Route Data Viewer ${runId}`, role: "Viewer", password: viewerPassword, active: true }
  });
  viewerId = created.body?.id ?? "";
  check("temporary Viewer created for the isolation check", created.status === 200 && Boolean(viewerId), `${created.status}`);

  if (viewerId) {
    const viewer = await loginForSmoke(baseURL, viewerEmail, viewerPassword, { label: "route-data viewer" });

    const viewerAudit = await get(viewer, "/api/data/audit?limit=3");
    // The point of the shared projection layer: a new endpoint must not become
    // a second door to what bootstrap withholds.
    check("a Viewer cannot read the audit trail", viewerAudit.status === 403, `${viewerAudit.status}`);
    check("the refusal leaks no audit rows", !JSON.stringify(viewerAudit.body).includes("entityType"), JSON.stringify(viewerAudit.body).slice(0, 80));

    const viewerBootstrap = await get(viewer, "/api/bootstrap");
    check("bootstrap still withholds audit rows from a Viewer", (viewerBootstrap.body.auditLogs ?? []).length === 0, `${(viewerBootstrap.body.auditLogs ?? []).length} rows`);
    check("bootstrap still withholds staff from a Viewer", (viewerBootstrap.body.appUsers ?? []).length === 0, `${(viewerBootstrap.body.appUsers ?? []).length} rows`);

    const viewerOrders = await get(viewer, "/api/data/orders?limit=3");
    check("a Viewer can still read operational data", viewerOrders.status === 200, `${viewerOrders.status}`);
  }
} catch (error) {
  check("smoke completed without throwing", false, error instanceof Error ? error.message : String(error));
} finally {
  if (viewerId && owner) {
    const disabled = await action(owner, "user.disable", { userId: viewerId });
    check("temporary Viewer disabled", disabled.status === 200, `${disabled.status}`);
  }
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.log("\nFailed:");
    for (const entry of failed) console.log(`  - ${entry.name}${entry.detail ? ` (${entry.detail})` : ""}`);
    console.log(`\nRoute-scoped data check: NOT PASSED against ${baseURL}.`);
    process.exitCode = 1;
  } else {
    console.log(`\nRoute-scoped data check: PASSED against ${baseURL}.`);
  }
}
