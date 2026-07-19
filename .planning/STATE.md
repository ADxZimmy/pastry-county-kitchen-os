# State

Last updated: 2026-07-11

## Current Focus

Execute the revised audit-remediation program from the July 10 expanded production audit (54/100, Not Ready). The Demo Trust Program is COMPLETE: S0 (006a), 007, 008, 009 and 010 are all deployed and production-verified, and the **D1 Demo Trust Gate (015-A) PASSED 30/30 against production on 2026-07-11**. An unscripted operator/investor demo is now approvable for the Demo Trust scope. Next is the MVP Hardening Program: Phase 011 (auth/session), 012 (performance), 013 (accessibility), 014 (real AI, optional and gated), then 015-B full UAT + external audit rerun.

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

- Nothing in flight. Phase 011 is COMPLETE; Phase 012 (performance and loading architecture) has not started.

## Deploy notes (2026-07-11)

- Production Vercel project is under team `sanuske2-2147s-projects`; `ADxZimmy` is the required GitHub commit identity. `SESSION_SECRET` is configured on that project, so a push auto-deploys and does not fail closed. This corrects the earlier local-CLI (`nnazimuzoo`) account-boundary note, which was an incomplete view from a CLI that is not linked to the production project.
- The Phase 007 deploy applies a larger idempotent migration on the first authenticated action: the `order_events` table, 11 order/order-item pricing columns, and a one-time legacy `created`-event backfill.

## Blocked

- CLEARED 2026-07-11: Operator/investor demo approval. The D1 Demo Trust Gate passed 30/30 against production (`AUDIT-UAT-1784387883299-53b5tx`), so an unscripted demo is approved for the Demo Trust scope (PCO-001..009, 014, 016). This is a demo-readiness clearance only — not MVP readiness and not a certification claim.

- Item: 100/100 certification claim.
  Reason: Product remediation plus external email DNS/operator sign-offs, backup/restore or rollback drills, and manual evidence remain outstanding.

## Next Action

Resolved 2026-07-11: production's `defaultDeductionStage` was `production_start` (unwired/ineffective before 009-B); on the owner's instruction it was set to `production_completion` via `settings.save` and verified against production (before `production_start` -> save 200 -> after `production_completion`). Live orders again deduct only at completion, matching all prior behaviour.

PHASE 009 IS COMPLETE and deployed (009-A `6d33a07`, 009-B `09890d5`/`e8a733f`, 009-C `7abc4bc`). PCO-006, PCO-007 and PCO-008 are all closed and production-verified: yield validation + the shared policy module, effective gram-rounding and deduction-stage settings, negative-inventory backorder semantics, the settings inventory, and unit divisibility (1.5 pack rejected, 1.5 kg accepted, per-ingredient override honoured — 6/6 live).

Phase 010-A is deployed and verified (`926861a`, `e4d3f1e`): the deterministic helper is honestly labelled "Kitchen Helper" through one shared descriptor, and every toast-only action that implied a change is gone — the conversion page now offers real "Save as verified/unverified rule" actions plus navigation, and the live production bundle was string-scanned to confirm "AI Assistant"/"Ask AI"/"Use this conversion" are absent. A stale "Ask AI" selector in the phase 2 smoke was updated in the same pass.

Slice 010-B is deployed and verified (`0511095`): `conversion.applyToRecipeItem` is the only path that changes a recipe from a conversion — role-checked, stale-write-safe (409 when the line moved since the review opened), provenance-recording, and import-evidence-preserving; the Recipe Detail "Convert unit" review modal reloads and asserts the line actually changed before claiming success. Probe passed 9/9 live (2 cup -> 240g persisted; stale and replay both refused with nothing changed; source evidence intact).

PHASE 010 IS COMPLETE for its demo-trust scope, so ALL Demo Trust Program phases (007, 008, 009, 010) are now deployed and production-verified.

THE D1 DEMO TRUST GATE PASSED 2026-07-11. `scripts/uat-core-smoke.mjs` (`npm.cmd run smoke:uat-core`) ran 30/30 green against production under run id `AUDIT-UAT-1784387883299-53b5tx`: it verified its run id was unique before writing anything, built the audit's Prompt 10 fixtures, and asserted every Demo Trust finding end to end — including proving the 16->12 scaling table by REAL server-side deductions (flour 225, sugar 375, cocoa 90, chocolate 187.5, eggs 3, oil 135) rather than trusting the client calculation. Cleanup ran in `finally` with `archiveFailures: []` and `activeResidue: []`. Full evidence in `.planning/phases/015-authenticated-uat-audit-rerun/VERIFICATION.md`.

PHASE 011 IS IN PROGRESS (MVP Hardening Program / M1 gate).

011-A is deployed and production-verified (`e4fa6c3`): opaque server-side sessions hashed into a new `app_sessions` table and carried in a `__Host-pcko_session` HttpOnly/Secure/SameSite=Lax cookie; Origin/Referer plus a session-bound CSRF token on cookie-authenticated writes; `GET /api/auth/session` and `POST /api/auth/logout`; rotation on login and server-side revocation. Shipped deliberately invisible — byte-identical bundle, bearer preferred during the window — so `smoke:auth-cookie` could prove it in production (31/31) before anything depended on it.

011-B1 is deployed and production-verified (`e86b654`, `ca7241d`): the browser holds no readable credential. localStorage keeps route/selection state only, the identity comes from the session endpoint, writes carry `x-csrf-token` from memory, a stale token self-heals with one retry, and logout revokes server-side. `readSession` actively purges the token any pre-011 build left in a returning browser. The whole browser smoke family was migrated to cookie seeding; `phase2-rerun` now proves PCO-012 directly (no credential in storage, cookie present, HttpOnly, invisible to `document.cookie`).

The first cutover build leaked a connection on every page load (the 401 session response body was never consumed), caught by the migrated smokes within minutes and fixed in `ca7241d`. Re-verified after the fix: full `smoke:live-audit` green, `smoke:auth-cookie` 31/31, and the D1 gate `smoke:uat-core` still 30/30 with clean cleanup.

011-B2 is deployed and production-verified (`3e51dca`, `f21e89c`): real password recovery replaces the placeholder toast. Tokens are 32 random bytes stored only as SHA-256 hashes, single-use, 30-minute expiry, with the validity check inside the redeeming UPDATE so concurrent redemptions cannot both win. A completed reset revokes every session and issues none. Enumeration is closed on body, status, and timing. If the mail sender is unconfigured the request is refused honestly rather than claiming a link was sent -- production was found to have Resend delivery configured. `smoke:password-reset` passes 16/16 without ever completing a reset.

The first B2 deploy left a timing oracle: the 600ms floor padded only the cheap branch while the known-address path paid a Resend call (~1.4s). Caught by the smoke, raised to 2500ms, gap fell from 1894ms to 307ms.

011-B3 is deployed and production-verified (`5c149a6`, `66d3143`), and PHASE 011 IS COMPLETE. Auth throttling moved to a counter shared by every serverless instance (RS-006): a concurrent burst of 8 login attempts admitted exactly 5 and threw 429 at 3, which a per-instance limiter could not do. Bearer credentials are retired -- cookies are the only credential the API accepts, login issues no token, and a bearer-only request is refused 401. `AUTH_BEARER_COMPAT=on` remains only as an unsupported rollback lever.

The smoke family moved off bearer BEFORE the server changed, which was the point: with throttling genuinely shared, seven children each signing in would have tripped the limit on the suite's own traffic and broken the gate at the moment it was needed. The runner now signs in once and passes the session to its children.

A broken 015-A run orphaned 9 records in production when its cleanup threw partway; they were archived and verified gone, and cleanup now attempts each archive independently.

Final cookie-only verification: 211/211 unit tests, all 7 browser smokes green, D1 gate 30/30 with clean cleanup, reset 16/16, cookie/CSRF/throttle 35/35.

Next: Phase 012 Performance And Loading Architecture (PCO-010, 011) -- immutable hashed assets, route chunks, paginated role-filtered endpoints, a shrinking bootstrap payload, Web Vitals, and a real CI performance gate. Then 013 accessibility, then 014 real AI (optional, gated on a provider/retention/budget decision). 015-B (full UAT + fresh external audit) stays last, after 011-014.

Deployed and production-verified 2026-07-11: S0/006a, Phase 007, Phase 008, Phase 009-A, the 009-B gram-rounding increment, AND the 009-B deduction-stage wiring (`18d2c69`) — a stage-toggling probe proved stock deducts EXACTLY ONCE at the configured stage (confirmation / production_start / completion), never twice. `main` synced with origin at `18d2c69`. Remediation: 9 of 16 PCO findings fully closed; PCO-006 closed; PCO-007 mostly closed (gram rounding + deduction stage effective; negative inventory + full settings inventory remain).

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
- Command/check: `npm.cmd run smoke:uat-core` — D1 Demo Trust Gate (production, 2026-07-11)
  Result: **PASSED, 30/30.** Run id uniqueness asserted before any write; PCO-001 real per-order events with a real actor and no fabricated entries; PCO-002 orders netting 7,500 and 40,000 (never 18,000); PCO-003 stale apply 409 + reviewed apply persisted with provenance + honest helper copy in the shipped bundle; PCO-004/005 forward-only transitions and idempotent produce (stock 4812.5 -> 4812.5 on repeat); PCO-006 zero yield 400; PCO-008 fractional pack 400; PCO-009 reason required, produced-order cancel blocked, pre-production cancel recorded; PCO-016 no mojibake; audit scaling table proven by real deductions. Cleanup manifest clean (`archiveFailures: []`, `activeResidue: []`).
