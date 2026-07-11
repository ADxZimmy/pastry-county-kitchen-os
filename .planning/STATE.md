# State

Last updated: 2026-07-11

## Current Focus

Execute the revised audit-remediation program from the July 10 expanded production audit (54/100, Not Ready). S0 (Phase 006a) is deployed and live-verified. Phase 007 Truthful Orders And Financials is implemented locally across all three slices (007-A/B/C) and awaits deploy + smoke to close its Demo Trust items. Phase 008 is next after that.

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
  - Added `api/security-containment.test.js`; suite now 94/94 across 6 files.

## In Progress

- None. Phase 006a shipped 2026-07-11 (pushed `7c1026b`, production auto-deployed on the ADxZimmy Vercel project) and is live-verified; S0 gate cleared.

## Deploy notes (2026-07-11)

- The first auto-deploy went live before `SESSION_SECRET` was in the build env, causing a brief authenticated-only outage (login/token verification 503; anonymous 401/410 unaffected). A Vercel Redeploy with the secret present fixed it; `/api/health` then reported `sessionSecret: "configured"`. Recorded in the 006a `VERIFICATION.md`.
- Account boundary (see memory `vercel-account-boundary`): the local Vercel CLI is `nnazimuzoo` and cannot set env vars on the production project, which is owned by `ADxZimmy`. Set fail-closed secrets on the ADxZimmy account before the deploying build. An empty stray project accidentally created via `vercel link` was deleted; the local `.vercel` link was removed.

## Blocked

- Item: Operator/investor demo approval.
  Reason: Demo Trust Gate has not passed; PCO-001 through PCO-009, PCO-014, and PCO-016 remain open in code.

- Item: 100/100 certification claim.
  Reason: Product remediation plus external email DNS/operator sign-offs, backup/restore or rollback drills, and manual evidence remain outstanding.

## Next Action

Deploy Phase 007 (commits `85ee60e`, `596ca01`, `c1c958e`) — `SESSION_SECRET` is already set, so a push auto-deploys and the new ensureOperationalTables migration adds order_events + the 11 pricing columns and backfills legacy created events on the first authenticated action. After deploy: verify `/api/health`, run `npm.cmd run smoke:live-audit` (exercises the new event/pricing paths), and spot-check that two orders show isolated timelines and different prices show different margins. Then start Phase 008 Production Transaction Safety. The owner chose to build 007-A/B/C locally and deploy them together (2026-07-11).

## Phase 007 status (implemented locally 2026-07-11)

- 007-A `85ee60e`: real order_events timeline + actor attribution (PCO-001, RS-005).
- 007-B `596ca01`: server-canonical order pricing; hard-coded 18,000 removed (PCO-002).
- 007-C `c1c958e`: data-derived restock guidance + mojibake fix (PCO-014, PCO-016).
- Local gates green: 114/114 tests, build clean, no runtime 18,000/mojibake/fabricated-timeline strings. DB-level behavior pending the production smoke.

## Verification Snapshot

- Command/check: `npm.cmd test`
  Result: Passed; 94/94 tests across 6 files (added `api/security-containment.test.js`, +14 tests).
- Command/check: `npm.cmd run build`
  Result: Passed; Vite produced 334.46 kB JS (93.82 kB gzip) and 21.96 kB CSS (5.32 kB gzip).
- Command/check: `npm.cmd audit --audit-level=moderate`
  Result: Passed; zero known vulnerabilities.
- Command/check: `git diff --check`
  Result: Passed; no whitespace errors.
- Check: Runtime probe of shipped handlers (`node verify-006a.mjs`, temporary, removed)
  Result: 7/7 passed — retired route 410; health 503-without/200-with `SESSION_SECRET` in production; `handleAction` rejects anon (401) and Baker (403) `schema.ensure` and anon `inventory.adjust` (401) with no DB access.
- Check: Legacy movement route caller audit
  Result: No tracked caller; `src/App.tsx` and `scripts/regression-audit-smoke.mjs` use the `inventory.adjust` action, so the route was retired rather than wrapped.
- Command/check: Deploy + live probes (production, 2026-07-11)
  Result: Passed after a Redeploy with `SESSION_SECRET` present. `/api/health` -> `sessionSecret: "configured"`; unauth `/api/inventory-movements` 410; unauth `schema.ensure`/`inventory.adjust` 401; unauth `/api/bootstrap` 401; login carries `Cache-Control: private, no-store`. First deploy briefly 503'd authenticated requests because the secret was not in that build; redeploy fixed it.
- Command/check: `npm.cmd run smoke:live-audit` (production)
  Result: Passed; all child smokes green, temporary records archived; authenticated login/token signing verified end to end.
