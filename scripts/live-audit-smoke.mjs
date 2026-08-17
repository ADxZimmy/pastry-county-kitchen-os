import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import { loginForSmoke, sessionEnv } from "./_smoke-session.mjs";

config({ path: ".env.production.local" });
config({ path: ".env.local" });
config();

const baseURL = process.env.LIVE_AUDIT_SMOKE_BASE_URL ?? process.env.LIVE_BASE_URL ?? "https://pastry-county-kitchen-os.vercel.app";
const databaseUrl = process.env.LIVE_AUDIT_DATABASE_URL ?? process.env.DATABASE_URL;
const useTemporaryUser = Boolean(databaseUrl);
const smokeEmail = useTemporaryUser ? `codex-smoke-${Date.now()}@pastrycounty.com` : process.env.LIVE_TEST_EMAIL;
const smokePassword = useTemporaryUser ? `${crypto.randomBytes(24).toString("base64url")}Aa1!` : process.env.LIVE_TEST_PASSWORD;

if (!smokeEmail || !smokePassword) {
  throw new Error("LIVE_TEST_EMAIL and LIVE_TEST_PASSWORD are required when LIVE_AUDIT_DATABASE_URL or DATABASE_URL is not configured.");
}

const sql = databaseUrl ? neon(databaseUrl) : null;

function childEnv(extraEnv = {}) {
  const cleaned = Object.fromEntries(
    Object.entries(process.env).filter(([key, value]) => value !== undefined && !key.startsWith("="))
  );
  return {
    ...cleaned,
    LIVE_BASE_URL: baseURL,
    LIVE_TEST_EMAIL: smokeEmail,
    LIVE_TEST_PASSWORD: smokePassword,
    ...extraEnv
  };
}

function runNpmScript(script, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const command = process.platform === "win32" ? "cmd.exe" : "npm";
    const args = process.platform === "win32" ? ["/d", "/s", "/c", `npm run ${script}`] : ["run", script];
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: childEnv(extraEnv),
      stdio: "inherit"
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} failed with exit code ${code}.`));
    });
  });
}


async function createSmokeUser() {
  if (!sql) return;
  const passwordHash = bcrypt.hashSync(smokePassword, 10);
  await sql`
    insert into app_users (id, email, full_name, role, password_hash, active, session_revoked_at)
    values (${`user-codex-smoke-${Date.now()}`}, ${smokeEmail}, 'Codex Smoke User', 'Owner/Admin', ${passwordHash}, true, null)
    on conflict (email) do update set full_name = excluded.full_name, role = excluded.role,
      password_hash = excluded.password_hash, active = true, session_revoked_at = null, updated_at = now()
  `;
  console.log("Temporary Owner/Admin smoke user created.");
}

async function removeSmokeUser() {
  if (!sql) return;
  // app_sessions and password_reset_tokens reference app_users with NO ACTION,
  // and since RS-006 this runner signs in itself, so its own session row refuses
  // the delete below. The constraint is not the defect: the app deactivates a
  // user via `active` and nothing in it ever hard-deletes one, so cascading the
  // real table to suit a test teardown would weaken a live guarantee. The
  // dependents this smoke created are cleared here instead.
  const [user] = await sql`select id from app_users where lower(email) = lower(${smokeEmail})`;
  if (!user) return;
  await sql`delete from app_sessions where user_id = ${user.id}`;
  await sql`delete from password_reset_tokens where user_id = ${user.id}`;
  await sql`delete from app_users where id = ${user.id}`;
  console.log("Temporary smoke user removed.");
}

async function assertCleanup() {
  if (!sql) {
    console.log("Database cleanup check skipped because LIVE_AUDIT_DATABASE_URL/DATABASE_URL is not configured; child smokes archive their own temporary data.");
    return;
  }
  const [smokeUsers, activeSmokeIngredients, fefoOverstatements] = await Promise.all([
    sql`select count(*)::int as count from app_users where lower(email) like 'codex-smoke-%'`,
    sql`select count(*)::int as count from ingredients where active = true and lower(name) like 'audit-smoke%'`,
    sql`
      select count(*)::int as count
      from (
        select ingredients.id
        from ingredients
        left join ingredient_batches on ingredient_batches.ingredient_id = ingredients.id and ingredient_batches.quantity_remaining > 0
        where ingredients.active = true
        group by ingredients.id, ingredients.base_unit, ingredients.current_stock
        having coalesce(sum(ingredient_batches.quantity_remaining) filter (where ingredient_batches.unit = ingredients.base_unit), 0) > ingredients.current_stock + 0.001
      ) mismatches
    `
  ]);

  const cleanup = {
    smokeUsers: smokeUsers[0].count,
    activeSmokeIngredients: activeSmokeIngredients[0].count,
    fefoOverstatements: fefoOverstatements[0].count
  };
  if (cleanup.smokeUsers || cleanup.activeSmokeIngredients || cleanup.fefoOverstatements) {
    throw new Error(`Live audit smoke cleanup check failed: ${JSON.stringify(cleanup)}.`);
  }
  console.log(`Live audit smoke cleanup verified: ${JSON.stringify(cleanup)}.`);
}

try {
  if (useTemporaryUser) await createSmokeUser();
  else console.log("Using configured live test user because LIVE_AUDIT_DATABASE_URL/DATABASE_URL is not configured.");

  // Login throttling is shared across instances since RS-006, so a suite where
  // every child signs in separately would trip the limit on its own legitimate
  // traffic. One login here is handed to every child that only needs an
  // authenticated session.
  const shared = await loginForSmoke(baseURL, smokeEmail, smokePassword, { label: "live-audit runner" });
  const sharedSession = sessionEnv(shared);
  console.log(`Signed in once as ${shared.email}; children reuse that session.`);

  // phase2-rerun is the exception: it drives the real login form, which is part
  // of what it exists to verify, so it signs in itself.
  await runNpmScript("smoke:phase2-rerun");
  await runNpmScript("smoke:milestone7", sharedSession);
  await runNpmScript("smoke:regression-audit", { ...sharedSession, REGRESSION_AUDIT_SMOKE_MUTATE: "1" });
  await runNpmScript("smoke:phase3-pastry", sharedSession);
  await runNpmScript("smoke:phase4-pastry-depth", sharedSession);
  await runNpmScript("smoke:navigation-routing", sharedSession);
  await runNpmScript("smoke:import-onboarding", sharedSession);
} finally {
  if (useTemporaryUser) await removeSmokeUser().catch((error) => console.warn(`Temporary smoke user cleanup failed: ${error.message}`));
}

await assertCleanup();
console.log(`Live audit smoke passed against ${baseURL}.`);
