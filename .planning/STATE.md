# State

Last updated: 2026-07-11

## Current Focus

Execute the revised audit-remediation program from the July 10 expanded production audit (54/100, Not Ready). S0 (Phase 006a), Phase 007 Truthful Orders And Financials, and Phase 008 Production Transaction Safety are all deployed and production-verified. Phase 009 (Validation, Settings And Unit Policy) is next, then Phase 010, then the 015-A Demo Trust gate. No unscripted demo is approved before the full D1 Demo Trust gate passes.

## Completed

- Phases 001-006 were implemented and production-smoke verified; their earlier June 22 96/100 audit remains useful regression evidence but is superseded as a launch signal by the July 10 expanded audit.
- Fast-forwarded local `main` from `e829a00` to `123643b`, the July 10 planning commit for phases 007-015.
- Read the full `Pastry_County_Kitchen_OS_Expanded_Audit_Report.md` dated 2026-07-10 and reconciled PCO-001 through PCO-016 with the current source.
- Confirmed the audit's critical/high source findings remain present at `123643b`: fabricated timeline, fixed 18,000 values, incorrect This Week filter, direct batch completion, non-positive yield exposure, disconnected settings, localStorage sessions, static guidance, placeholder reset, and mojibake.
- Revised the program into explicit Security, Demo Trust, MVP, and Audit Rerun gates; added early authenticated UAT rather than waiting until the end.
- Added repo-reconciliation risks omitted from the external audit: unauthenticated serverless inventory mutation, public `schema.ensure`/pre-auth DDL, raw 500 detail leakage, weak production secret fallback, caller-controlled movement attribution, process-local throttling, and absent CI.
- Implemented Phase 006a Immediate Security Containment (RS-001..RS-004) and verified it locally:
  - RS-001: retired the unauthenticated `/api/inventory-movements` route (serverless + Express) to a 410 that points callers to the authenticated `inventory.adjust` action; confirmed no tracked caller used the HTTP route.
  - RS-002: made `schema.ensure` Owner/Admin-only and reordered `handleAction`/`produceOrder` so `requirePermission` runs before `ensureOperationalTables`, so anon/wrong-role callers are rejected (401/403) before any DDL.
  - RS-003: `sendError`/`safeErrorResponse` now mask unexpected 500s with a correlation id and server-side log while preserving deliberate 4xx/503 messages; unified the Express error middleware onto `sendError`.
  - RS-004: `sessionSecret` fails closed in production (no `DATABASE_URL`/dev fallback); added `sessionSecretConfigured`, a `/api/health` preflight, and documented `SESSION_SECRET` in `.env.example`.
  - Added `private, no-store` to login/actions/bootstrap/produced responses (full centralization deferred to Phase 011).
  - Added `api/security-containment.test.js`; suite was 94/94 across 6 files at 006a.
- Configured a generated 48-byte base64url `SESSION_SECRET` as a sensitive Production environment variable on the existing Vercel project; the value was never written to the repository or planning record.
- Corrected the deployment-account diagnosis: `ADxZimmy` is the required GitHub commit identity, while the production Vercel project has remained linked to team `sanuske2-2147s-projects` (`team_SumcS7BfGXgJWdQc7y2iAxSk`). No account-link revert was required.
- Redeployed production as `dpl_EHgWLn3YWvWRhwY7U9wYUWU5VSCi`; the canonical alias is Ready. Verified health 200 with `sessionSecret: "configured"`, the retired movement route at 410, and unauthenticated `schema.ensure` at 401.
- Updated the umbrella smoke runner to respect the existing five-login/60-second production limit. `npm.cmd run smoke:live-audit` then passed all component suites and verified cleanup with zero temporary smoke users, active smoke ingredients, or FEFO overstatements.
- Implemented Phase 007 locally in three committed slices (114/114 tests, build clean):
  - 007-A `85ee60e`: `order_events` table + idempotent migration + truthful legacy `created` backfill; transactional per-mutation events with authenticated actor attribution; real Order Detail timeline; `audit()` and order movements record the real actor (PCO-001, RS-005).
  - 007-B `596ca01`: nullable order/order-item pricing columns; one authoritative `computeOrderPricing` contract (validates, recomputes, ignores client totals, rounds once) persisted by `order.save`; real net/gross/margin/balance in the UI; every hard-coded 18,000 removed (PCO-002).
  - 007-C `c1c958e`: data-derived restock guidance replacing "Restock before Friday"; mojibake fixed (PCO-014, PCO-016).

## In Progress

- Phase 007 (007-A/B/C) is implemented and committed locally; it awaits deploy + production smoke to close its Demo Trust items. Phase 006a is fully shipped and production-verified (see Completed).

## Deploy notes (2026-07-11)

- Production Vercel project is under team `sanuske2-2147s-projects`; `ADxZimmy` is the required GitHub commit identity. `SESSION_SECRET` is configured on that project, so a push auto-deploys and does not fail closed. This corrects the earlier local-CLI (`nnazimuzoo`) account-boundary note, which was an incomplete view from a CLI that is not linked to the production project.
- The Phase 007 deploy applies a larger idempotent migration on the first authenticated action: the `order_events` table, 11 order/order-item pricing columns, and a one-time legacy `created`-event backfill.

## Blocked

- Item: Operator/investor demo approval.
  Reason: Demo Trust Gate has not passed; PCO-001 through PCO-009, PCO-014, and PCO-016 remain open until Phase 007 (deployed) plus 008-010 close them.

- Item: 100/100 certification claim.
  Reason: Product remediation plus external email DNS/operator sign-offs, backup/restore or rollback drills, and manual evidence remain outstanding.

## Next Action

Resume Phase 009-B with the stock-integrity-critical piece, ideally with fresh context: wire `defaultDeductionStage` into the Phase 008 idempotent completion (deduct at confirmation / production_start / completion, using the `production_runs` unique key so it deducts exactly once across stages; default stays `production_completion`), define `allowNegativeInventory` semantics (disabled blocks; enabled records an aggregate deficit while FEFO lots stay >= 0 and the order shows shortage), and enforce/rename/remove every remaining setting with contract tests. Then 009-C Unit Divisibility (per-ingredient allows_decimals / minimum_increment). Deploy each DB-touching slice with `smoke:live-audit`.

Owner decision 2026-07-11: after a very long session, deployed the safe 009-A + gram-rounding increment and paused before the deduction-stage wiring rather than rush a change that moves real stock.

Deployed so far (all production-verified): S0/006a, Phase 007, Phase 008, Phase 009-A, and the 009-B gram-rounding increment. `main` is synced with origin at `7b91198`. Remediation: 9 of 16 PCO findings fully closed; PCO-006 closed and half of PCO-007.

## Phase 008 status (implemented locally 2026-07-11, complete)

- 008-A `376509b`: Africa/Lagos production eligibility + corrected Today/Tomorrow/This Week buckets; server-enforced order state machine `isValidOrderTransition` (PCO-004, PCO-005 lifecycle).
- 008-B `b17c05f`: `production_runs` table with `unique(order_id)`; produceOrder claims the run as the first transaction statement so a concurrent/repeat completion fails with 23505 and rolls back (idempotent `alreadyProduced`, no double deduction); batch completion routes through a confirmation modal with a current->deducts->resulting-stock preview (PCO-005 completion).
- 008-C `6b44f0b`: `cancellationConsequences` helper; cancellation requires a reason (recorded on event + audit) and is blocked after deduction; consequence-aware cancellation modal (PCO-009).
- Local gates green: 131/131 tests, build clean. DB-level behavior (migration, idempotency, filters, cancellation) pending the production smoke.

Phase 007 shipped 2026-07-11: pushed the four 007 commits + merge `add3079`, then hotfix `a75c688` after the first build 500'd `/api/bootstrap` (ambiguous `created_at` in the new order_events join). `smoke:live-audit` is green; bootstrap returns 200 with orderEvents + pricing fields.

## Verification Snapshot

- Command/check: `npm.cmd test`
  Result: Passed; 114/114 tests across 6 files (94 at 006a, +20 across Phase 007).
- Command/check: `npm.cmd run build`
  Result: Passed; Vite production build clean (JS ~339.7 kB / 95.4 kB gzip).
- Command/check: `npm.cmd audit --audit-level=moderate`
  Result: Passed at 006a; zero known vulnerabilities.
- Command/check: `git diff --check`
  Result: Passed; no whitespace errors.
- Check: Runtime-source scans (Phase 007)
  Result: No hard-coded `18000` outside test fixtures, no fabricated timeline strings, no mojibake across src/api/db/server.
- Command/check: 006a deploy + live probes (production, 2026-07-11)
  Result: Passed. Deployment `dpl_EHgWLn3YWvWRhwY7U9wYUWU5VSCi` Ready; `/api/health` -> `sessionSecret: "configured"`; unauth `/api/inventory-movements` 410; unauth `schema.ensure`/`inventory.adjust` 401; unauth `/api/bootstrap` 401; login carries `Cache-Control: private, no-store`.
- Command/check: `npm.cmd run smoke:live-audit` (production, 006a)
  Result: Passed; all child smokes green, cleanup verified with zero temporary smoke users/ingredients/FEFO overstatements.
- Command/check: Phase 007 deploy + smoke (production, 2026-07-11)
  Result: Passed after hotfix `a75c688`. First 007 build 500'd `/api/bootstrap` (ambiguous `created_at` where the order_events query joins orders); fully qualifying the query columns fixed it. Post-fix bootstrap 200 with orderEvents + pricing; full `smoke:live-audit` green with cleanup. Lesson recorded: DB-query changes need an integration smoke, not just the DB-less unit suite.
