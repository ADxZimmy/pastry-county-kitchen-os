// Schema migrations (RS-007), command-line runner.
//
// Until Phase 012 this work ran on ordinary requests: roughly a hundred ALTER
// and CREATE statements plus a repair UPDATE, executed on every bootstrap and
// every action. It was idempotent so it worked, but it made reads do schema
// work, wrote to the database on a read path, and meant any request could change
// the schema.
//
// The step list lives in api/_migrations.js so this runner and the Owner/Admin
// `schema.ensure` action apply exactly the same thing. Every step is idempotent,
// so running this is safe at any time and a no-op once applied.
//
//   npm run db:migrate             apply pending steps
//   npm run db:migrate -- --check  report status without changing anything
//
// If no database credential is available locally, an Owner/Admin can apply the
// same migrations through the app instead, which uses the server's own
// credential rather than requiring one to be copied anywhere.
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { migrationStatus, runMigrations } from "../api/_migrations.js";

config({ path: ".env.local" });
config();

const databaseUrl = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL;
const checkOnly = process.argv.includes("--check");

if (!databaseUrl) {
  console.error("migrate requires DATABASE_URL (or MIGRATE_DATABASE_URL) to be set.");
  console.error("Alternatively, an Owner/Admin can apply migrations through the app's schema.ensure action.");
  process.exit(1);
}

const sql = neon(databaseUrl);

if (checkOnly) {
  const { applied, pending } = await migrationStatus(sql);
  for (const id of applied) console.log(`  applied  ${id}`);
  for (const id of pending) console.log(`  PENDING  ${id}`);
  console.log(pending.length ? `\n${pending.length} migration(s) pending. Run: npm run db:migrate` : "\nSchema is up to date.");
  process.exit(pending.length ? 1 : 0);
}

const { ran, skipped } = await runMigrations(sql);
for (const id of skipped) console.log(`  skip     ${id}`);
for (const id of ran) console.log(`  applied  ${id}`);
console.log(ran.length ? `\nApplied ${ran.length} migration(s).` : "\nSchema already up to date; nothing to apply.");
