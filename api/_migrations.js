// The migration step list, shared by the CLI runner and the admin action so
// there is exactly one definition of what the schema should be.
//
// RS-007 forbids schema mutation on ordinary requests. Running these from an
// authenticated, authorised, audited Owner/Admin action is not an ordinary
// request — it is the deliberate operation the rule carves out, and it lets the
// migration use the server's own database credential rather than requiring one
// to be copied onto someone's laptop.
//
// Steps are imported lazily inside each runner so this module can be pulled in
// from either side without an import cycle at load time.
const STEPS = [
  { id: "001-core-snapshot-schema", run: async (sql) => (await import("./_db.js")).ensureSnapshotSchema(sql) },
  { id: "002-operational-tables", run: async (sql) => (await import("./_actions.js")).ensureOperationalTables(sql) },
  { id: "003-session-columns", run: async (sql) => (await import("./_auth.js")).ensureSessionColumns(sql) },
  { id: "004-app-sessions", run: async (sql) => (await import("./_sessions.js")).ensureSessionTables(sql) },
  { id: "005-password-reset-tokens", run: async (sql) => (await import("./_passwordReset.js")).ensurePasswordResetTable(sql) },
  { id: "006-auth-rate-limits", run: async (sql) => (await import("./_rateLimit.js")).ensureRateLimitTable(sql) },
  { id: "007-app-users-data-mode", run: async (sql) => (await import("./_auth.js")).ensureDataModeColumn(sql) }
];

export function migrationIds() {
  return STEPS.map((step) => step.id);
}

async function ensureMigrationsTable(sql) {
  await sql`
    create table if not exists schema_migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    )
  `;
}

async function appliedIds(sql) {
  const rows = await sql`select id from schema_migrations`;
  return new Set(rows.map((row) => row.id));
}

export async function migrationStatus(sql) {
  await ensureMigrationsTable(sql);
  const applied = await appliedIds(sql);
  return {
    applied: STEPS.filter((step) => applied.has(step.id)).map((step) => step.id),
    pending: STEPS.filter((step) => !applied.has(step.id)).map((step) => step.id)
  };
}

// Every step is idempotent, so running this is safe at any time and a no-op once
// applied. Steps already recorded are skipped outright.
export async function runMigrations(sql) {
  await ensureMigrationsTable(sql);
  const applied = await appliedIds(sql);
  const ran = [];
  const skipped = [];

  for (const step of STEPS) {
    if (applied.has(step.id)) {
      skipped.push(step.id);
      continue;
    }
    await step.run(sql);
    await sql`insert into schema_migrations (id) values (${step.id}) on conflict (id) do nothing`;
    ran.push(step.id);
  }

  return { ran, skipped, total: STEPS.length };
}
