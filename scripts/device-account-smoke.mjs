// Phase 016: the privacy proof for device accounts.
//
// A tester's kitchen data must never reach this database. Everything else in this
// phase supports that claim; this is the check that tries to falsify it against
// real production.
//
// Safety contract, in the same shape as the other production smokes:
//   * The ONLY server rows this run may create are one account and its sessions.
//     That is also the feature's guarantee, which is what makes this smoke the
//     proof rather than a demonstration.
//   * Every record is named with a unique run id, and the run aborts before
//     creating anything if that id already appears.
//   * Cleanup runs in `finally`, in foreign-key order, each step attempted
//     independently so one failure cannot strand the rest.
//   * Residue is asserted AFTER cleanup and fails the run if anything remains.
//
// Requires SIGNUP_INVITE_CODE and a database credential. A missing one exits
// non-zero: a privacy gate that quietly skips is worse than no gate, because it
// reports green while proving nothing.
//
//   npm run smoke:device-account
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.production.local" });
config({ path: ".env.local" });
config();

const baseURL = process.env.DEVICE_SMOKE_BASE_URL ?? process.env.LIVE_BASE_URL ?? "https://pastry-county-kitchen-os.vercel.app";
const inviteCode = process.env.SIGNUP_INVITE_CODE;
const databaseUrl = process.env.DEVICE_SMOKE_DATABASE_URL ?? process.env.DATABASE_URL;

const missing = [];
if (!inviteCode) missing.push("SIGNUP_INVITE_CODE");
if (!databaseUrl) missing.push("DATABASE_URL (or DEVICE_SMOKE_DATABASE_URL)");
if (missing.length) {
  console.error(`PRECONDITION MISSING: ${missing.join(", ")}.`);
  console.error("This gate proves a tester's kitchen data never reaches the database. It cannot be skipped quietly:");
  console.error("without the invite code it cannot create the account, and without a database credential it cannot");
  console.error("check what the account left behind.");
  process.exit(1);
}

const sql = neon(databaseUrl);
const RUN_ID = `DEVICE-SMOKE-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const EMAIL = `device-smoke-${RUN_ID.toLowerCase()}@pastrycounty.com`;
const FULL_NAME = `Device Smoke ${RUN_ID}`;
const PASSWORD = `${RUN_ID}-Buttercream-99!`;
const origin = new URL(baseURL).origin;

const results = [];
let createdUserId = "";
let session = null;

function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail: detail ?? "" });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` -> ${detail}` : ""}`);
}

async function post(path, body, headers = {}) {
  const response = await fetch(new URL(path, baseURL), {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin, ...headers },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, payload, setCookie: response.headers.get("set-cookie") ?? "" };
}

async function get(path, headers = {}) {
  const response = await fetch(new URL(path, baseURL), { headers: { Origin: origin, ...headers } });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, payload };
}

function sessionHeaders() {
  if (!session) throw new Error("No session");
  return {
    Cookie: `${new URL(baseURL).protocol === "https:" ? "__Host-pcko_session" : "pcko_session_dev"}=${session.cookie}`,
    "x-csrf-token": session.csrfToken
  };
}

try {
  // --- Preflight ----------------------------------------------------------
  // A failed Vercel build leaves the PREVIOUS deployment serving, so every route
  // that already existed keeps working. Reading a 403 as containment against a
  // stale build would be meaningless, so the new route must be proven present
  // first.
  const routePresence = await get("/api/auth/signup");
  check(
    "the signup route exists on the deployment under test",
    routePresence.status !== 404,
    `GET returned ${routePresence.status} (405 expected for a POST-only route)`
  );
  if (routePresence.status === 404) throw new Error("Signup route is missing: this build is not deployed. Nothing below would mean anything.");

  const migrated = await sql`
    select 1 from information_schema.columns
    where table_name = 'app_users' and column_name = 'data_mode' limit 1
  `;
  check("migration 007 has been applied", migrated.length > 0, migrated.length ? "data_mode column present" : "run npm run db:migrate");
  if (!migrated.length) throw new Error("app_users.data_mode is missing; signup would refuse with 503.");

  const collision = await sql`select id from app_users where lower(email) = ${EMAIL} limit 1`;
  check("the run id is unique before anything is created", collision.length === 0, EMAIL);
  if (collision.length) throw new Error("Run id collision; aborting before any write.");

  // --- Signup -------------------------------------------------------------
  const wrongInvite = await post("/api/auth/signup", {
    fullName: FULL_NAME,
    email: `wrong-${EMAIL}`,
    password: PASSWORD,
    inviteCode: `${inviteCode}-wrong`
  });
  check("a wrong invite code is refused", wrongInvite.status === 403, `status ${wrongInvite.status}`);

  const signup = await post("/api/auth/signup", { fullName: FULL_NAME, email: EMAIL, password: PASSWORD, inviteCode });
  check("signup succeeds with the invite code", signup.status === 200, `status ${signup.status} ${signup.payload.error ?? ""}`);
  check("the new account is a device account", signup.payload.dataMode === "device", `dataMode ${signup.payload.dataMode}`);
  check("signup issues a session immediately", Boolean(signup.payload.csrfToken), "csrf token returned");
  check("signup returns no bearer token", signup.payload.token === undefined, "body carries no token");

  createdUserId = signup.payload.id ?? "";
  const cookieMatch = /(?:__Host-pcko_session|pcko_session_dev)=([^;]+)/.exec(signup.setCookie);
  check("the session arrives as a cookie, not in the body", Boolean(cookieMatch), cookieMatch ? "cookie set" : signup.setCookie.slice(0, 60));
  if (!cookieMatch) throw new Error("No session cookie returned from signup.");
  session = { cookie: cookieMatch[1], csrfToken: signup.payload.csrfToken };

  const duplicate = await post("/api/auth/signup", { fullName: FULL_NAME, email: EMAIL, password: PASSWORD, inviteCode });
  check("a duplicate email is refused", duplicate.status === 409, `status ${duplicate.status}`);

  // --- Containment --------------------------------------------------------
  const bootstrap = await get("/api/bootstrap", sessionHeaders());
  check("the shared kitchen snapshot is refused", bootstrap.status === 403, `status ${bootstrap.status}`);

  for (const resource of ["summary", "orders", "audit", "movements", "batches"]) {
    const read = await get(`/api/data/${resource}`, sessionHeaders());
    check(`/api/data/${resource} is refused`, read.status === 403, `status ${read.status}`);
  }

  for (const [action, body] of [
    ["ingredient.save", { ingredient: { name: `${RUN_ID} Flour`, category: "Dry", baseUnit: "g", currentStock: 1 } }],
    ["settings.save", { settings: { businessName: RUN_ID } }],
    ["order.save", { order: { customerName: RUN_ID, items: [] } }],
    ["schema.ensure", { check: true }]
  ]) {
    const write = await post("/api/actions", { action, ...body }, sessionHeaders());
    check(`${action} is refused`, write.status === 403, `status ${write.status}`);
  }

  // --- The two actions that legitimately stay on the server ---------------
  const extract = await post(
    "/api/actions",
    {
      action: "import.extract",
      sourceName: `${RUN_ID}.txt`,
      sourceType: "text",
      text: "Smoke Cake\n200 g flour\n100 g sugar",
      localContext: { ingredients: [{ id: "local-flour", name: "Local Flour", baseUnit: "g" }], recipes: [], suppliers: [] }
    },
    sessionHeaders()
  );
  check("import.extract still works for a device account", extract.status === 200, `status ${extract.status} ${extract.payload.error ?? ""}`);

  const alert = await post(
    "/api/actions",
    { action: "notification.lowStockEmail", items: [`${RUN_ID}: 1 kg left`] },
    sessionHeaders()
  );
  check("the low-stock alert still works", alert.status === 200, `status ${alert.status} ${alert.payload.error ?? ""}`);
  check(
    "the alert goes only to the tester, never to the bakery's staff",
    Array.isArray(alert.payload.recipients) && alert.payload.recipients.length === 1 && alert.payload.recipients[0] === EMAIL,
    JSON.stringify(alert.payload.recipients)
  );

  // --- The proof: nothing of this account's is in the database ------------
  // Matched on the full name as well as the email, because actorLabel prefers a
  // full name -- an email-only query is a check that could never match what the
  // server actually writes.
  const nameOrEmail = [FULL_NAME, EMAIL];
  const [audit, movements, events, notifications, orders, ingredients, recipes] = await Promise.all([
    sql`select count(*)::int as count from audit_logs where actor = any(${nameOrEmail}) or entity_id = ${createdUserId}`,
    sql`select count(*)::int as count from inventory_movements where created_by = any(${nameOrEmail})`,
    sql`select count(*)::int as count from order_events where actor_name = any(${nameOrEmail}) or actor_user_id = ${createdUserId}`,
    sql`select count(*)::int as count from notification_events where created_by = any(${nameOrEmail}) or recipient = ${EMAIL}`,
    sql`select count(*)::int as count from orders where customer_name like ${`%${RUN_ID}%`}`,
    sql`select count(*)::int as count from ingredients where name like ${`%${RUN_ID}%`}`,
    sql`select count(*)::int as count from recipes where name like ${`%${RUN_ID}%`}`
  ]);

  // The signup audit row is the one deliberate exception: the owner is meant to
  // see who let themselves in. It is about the ACCOUNT, never about the kitchen.
  const signupRows = await sql`
    select action from audit_logs where entity_id = ${createdUserId}
  `;
  const onlySignupAudit = signupRows.every((row) => row.action === "signup");
  check(
    "the only audit entry for this account is its own signup",
    onlySignupAudit && audit[0].count === signupRows.length,
    `${audit[0].count} row(s), actions: ${[...new Set(signupRows.map((r) => r.action))].join(",") || "none"}`
  );

  check("no stock movements were attributed to this account", movements[0].count === 0, `${movements[0].count}`);
  check("no order events were attributed to this account", events[0].count === 0, `${events[0].count}`);
  check("no notification rows were written for this account", notifications[0].count === 0, `${notifications[0].count}`);
  check("no orders carry this run id", orders[0].count === 0, `${orders[0].count}`);
  check("no ingredients carry this run id", ingredients[0].count === 0, `${ingredients[0].count}`);
  check("no recipes carry this run id", recipes[0].count === 0, `${recipes[0].count}`);

  // --- The central kill switch still reaches a device account -------------
  await sql`update app_users set active = false, session_revoked_at = now() where id = ${createdUserId}`;
  const afterDisable = await post("/api/actions", { action: "import.extract", sourceName: "x", sourceType: "text", text: "x" }, sessionHeaders());
  check("disabling the account locks it out immediately", afterDisable.status === 401, `status ${afterDisable.status}`);
} catch (error) {
  check("the run completed without an unexpected error", false, error instanceof Error ? error.message : String(error));
} finally {
  // Foreign-key order, each attempted independently: app_sessions and
  // password_reset_tokens reference app_users with NO ACTION, so the user delete
  // is refused while either exists. One failure must not strand the rest.
  if (createdUserId) {
    for (const [label, statement] of [
      ["sessions", () => sql`delete from app_sessions where user_id = ${createdUserId}`],
      ["reset tokens", () => sql`delete from password_reset_tokens where user_id = ${createdUserId}`],
      ["signup audit row", () => sql`delete from audit_logs where entity_id = ${createdUserId}`],
      ["account", () => sql`delete from app_users where id = ${createdUserId}`]
    ]) {
      try {
        await statement();
      } catch (error) {
        console.warn(`Cleanup of ${label} failed: ${error instanceof Error ? error.message : error}`);
      }
    }
  }
}

// Residue is asserted after cleanup, so a cleanup that silently failed cannot
// pass as a clean run.
const residue = {
  accounts: (await sql`select count(*)::int as count from app_users where lower(email) = ${EMAIL}`)[0].count,
  sessions: (await sql`select count(*)::int as count from app_sessions where user_id = ${createdUserId || "none"}`)[0].count,
  auditRows: (await sql`select count(*)::int as count from audit_logs where entity_id = ${createdUserId || "none"}`)[0].count
};
check("cleanup left nothing behind", Object.values(residue).every((count) => count === 0), JSON.stringify(residue));

const failed = results.filter((row) => !row.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.error(`\nDevice account privacy check FAILED (run ${RUN_ID}):`);
  for (const row of failed) console.error(`  - ${row.name}${row.detail ? ` (${row.detail})` : ""}`);
  process.exit(1);
}
console.log(`\nDevice account privacy check: PASSED against ${baseURL} (run ${RUN_ID}).`);
console.log("A device account reached no business data on the server, and left none behind.");
