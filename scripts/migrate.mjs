// Schema migrations (RS-007).
//
// Until Phase 012 this work ran on ordinary requests: roughly a hundred ALTER
// and CREATE statements plus a repair UPDATE, executed on every bootstrap and
// every action. It was idempotent so it worked, but it made reads do schema work,
// wrote to the database on a read path, and meant any request could change the
// schema. Schema changes now happen here and only here.
//
// Every step is still idempotent, so running this is safe at any time and a
// no-op once applied.
//
//   npm run db:migrate           apply pending steps
//   npm run db:migrate -- --check  report status without changing anything
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { ensureSnapshotSchema } from "../api/_db.js";
import { ensureOperationalTables } from "../api/_actions.js";
import { ensureSessionColumns } from "../api/_auth.js";
import { ensureSessionTables } from "../api/_sessions.js";
import { ensurePasswordResetTable } from "../api/_passwordReset.js";
import { ensureRateLimitTable } from "../api/_rateLimit.js";

config({ path: ".env.local" });
config();

const databaseUrl = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL;
const checkOnly = process.argv.includes("--check");

if (!databaseUrl) {
  console.error("migrate requires DATABASE_URL (or MIGRATE_DATABASE_URL) to be set.");
  process.exit(1);
}

const sql = neon(databaseUrl);

// Ordered because later steps reference tables earlier ones create.
const STEPS = [
  { id: "001-core-snapshot-schema", run: ensureSnapshotSchema },
  { id: "002-operational-tables", run: ensureOperationalTables },
  { id: "003-session-columns", run: ensureSessionColumns },
  { id: "004-app-sessions", run: ensureSessionTables },
  { id: "005-password-reset-tokens", run: ensurePasswordResetTable },
  { id: "006-auth-rate-limits", run: ensureRateLimitTable }
];

async function ensureMigrationsTable() {
  await sql`
    create table if not exists schema_migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    )
  `;
}

async function appliedIds() {
  const rows = await sql`select id from schema_migrations`;
  return new Set(rows.map((row) => row.id));
}

await ensureMigrationsTable();
const applied = await appliedIds();

if (checkOnly) {
  const pending = STEPS.filter((step) => !applied.has(step.id));
  for (const step of STEPS) console.log(`  ${applied.has(step.id) ? "applied" : "PENDING"}  ${step.id}`);
  console.log(pending.length ? `\n${pending.length} migration(s) pending. Run: npm run db:migrate` : "\nSchema is up to date.");
  process.exit(pending.length ? 1 : 0);
}

let ran = 0;
for (const step of STEPS) {
  if (applied.has(step.id)) {
    console.log(`  skip     ${step.id}`);
    continue;
  }
  process.stdout.write(`  apply    ${step.id} ... `);
  await step.run(sql);
  await sql`insert into schema_migrations (id) values (${step.id}) on conflict (id) do nothing`;
  ran += 1;
  console.log("done");
}

console.log(ran ? `\nApplied ${ran} migration(s).` : "\nSchema already up to date; nothing to apply.");
