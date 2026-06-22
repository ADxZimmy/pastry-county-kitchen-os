# Context

## Goal

Create the execution plan for closing the June 22 live-audit findings and increasing production readiness.

## Relevant Files

- Path: `api/bootstrap.js`
  Why it matters: It currently returns `loadKitchenSnapshot()` without checking authentication.

- Path: `server/index.js`
  Why it matters: The local/server route for `/api/bootstrap` also returns snapshots without session validation.

- Path: `api/_auth.js`
  Why it matters: Existing signed session helpers should be reused to protect bootstrap and role-sensitive data.

- Path: `api/_db.js`
  Why it matters: `loadKitchenSnapshot()` returns suppliers, staff, orders, movements, batches, audit logs, conversion rules, and settings; may need actor/role filtering.

- Path: `api/_actions.js`
  Why it matters: Shopping purchase, conversion save/delete, staff, production, and audit writes live here.

- Path: `db/schema.sql`
  Why it matters: Repo schema uses numeric purchase prices, but live audit saw an integer parsing failure; migration/live schema drift must be checked.

- Path: `src/App.tsx`
  Why it matters: Authenticated bootstrap loading, routing fallback, dashboard date filtering, modals, shopping UI, and audit-log search are user-facing here.

- Path: `src/lib/kitchen.ts`
  Why it matters: AI assistant parsing and conversion helpers live here.

- Path: `src/lib/audit.ts`
  Why it matters: Audit search/export helpers are already shared and should be extended for display-name search.

- Path: `scripts/live-audit-smoke.mjs`, `scripts/regression-audit-smoke.mjs`, `scripts/milestone7-smoke.mjs`
  Why it matters: These should become the acceptance suite for the recovery work.

## Decisions

- Decision: Treat June 22 audit as a new Milestone 9 instead of rewriting completed Milestone 7/8 history.
  Reason: The repo has valid prior recovery work, but the latest external audit found new or live-only blockers.

- Decision: Fix `/api/bootstrap` first.
  Reason: Public operational data exposure is the only Critical finding and blocks any real-data production use.

- Decision: Decimal purchase work must include live schema/migration verification.
  Reason: Unit tests already cover decimal normalization, but the live audit still hit `invalid input syntax for type integer: "0.5"`.

## Risks

- Risk: Bootstrap auth changes can break initial app loading if the frontend has no token when it fetches data.
  Mitigation: Login/welcome route should remain public; authenticated app pages should pass bearer token and show a login/session-expired state on 401.

- Risk: Live schema drift may not be represented by `db/schema.sql`.
  Mitigation: Add idempotent migration checks in server setup/action path or a dedicated safe migration script, then verify on production.

- Risk: Conversion-rule dedupe may archive legitimate measured rules.
  Mitigation: Dedupe by active ingredient/from/to, preserve the newest/highest-confidence rule, and write audit logs for archived duplicates.
