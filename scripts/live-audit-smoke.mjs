import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";

config({ path: ".env.production.local" });
config({ path: ".env.local" });
config();

const baseURL = process.env.LIVE_AUDIT_SMOKE_BASE_URL ?? process.env.LIVE_BASE_URL ?? "https://pastry-county-kitchen-os.vercel.app";
const databaseUrl = process.env.LIVE_AUDIT_DATABASE_URL ?? process.env.DATABASE_URL;
const smokeEmail = `codex-smoke-${Date.now()}@pastrycounty.com`;
const smokePassword = `${crypto.randomBytes(24).toString("base64url")}Aa1!`;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required. This runner loads .env.production.local by default; set LIVE_AUDIT_DATABASE_URL to override.");
}

const sql = neon(databaseUrl);

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
  await sql`delete from app_users where lower(email) = lower(${smokeEmail})`;
  console.log("Temporary smoke user removed.");
}

async function assertCleanup() {
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
  await createSmokeUser();
  await runNpmScript("smoke:milestone7");
  await runNpmScript("smoke:regression-audit", { REGRESSION_AUDIT_SMOKE_MUTATE: "1" });
} finally {
  await removeSmokeUser().catch((error) => console.warn(`Temporary smoke user cleanup failed: ${error.message}`));
}

await assertCleanup();
console.log(`Live audit smoke passed against ${baseURL}.`);
