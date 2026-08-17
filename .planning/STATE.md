# State

Last updated: 2026-08-17

## Current Focus

The audit-remediation programme from the July 10 expanded production audit (54/100, Not Ready) is **executed end to end**. Both sub-programmes are complete and production-verified: Demo Trust (S0/006a, 007, 008, 009, 010) with the D1 gate PASSED 30/30 on 2026-07-11, and MVP Hardening (011 auth/session, 012 performance, 013 accessibility, 014-A assistant contracts) with the 015-B full UAT gate PASSED 9/9 on 2026-07-19 and again twice on 2026-08-17.

**Nothing is in flight and no engineering blocks closure.** What remains is owner action, listed in `.planning/ROADMAP.md`: commission the fresh independent audit (the step that closes the programme), the manual keyboard-only and screen-reader pass, the `pastrycounty.com` → `pastrycounty.ng` mail-delivery DNS problem, and the provider/retention decision gating 014-B/C. Optional engineering with no failing check behind it: 014-B/C, Phase 013 cosmetic polish, and the Phase 012 optimisation leftovers.

No replacement audit score is claimed. The June 96/100 is superseded and only a fresh independent audit can set a new one.

The stale note this section carried until 2026-08-17 — that Phases 011-014 and 015-B were still "next" — predated their delivery by a month. `.planning/ROADMAP.md` carried the same error and was corrected in the same pass.

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

- Nothing in flight. The 015-B full UAT gate PASSED 9/9 against production and the audit handoff is rewritten. What remains is owner action: request a fresh independent audit. Optional engineering left: 014-B/C (needs a provider key), Phase 013 cosmetic polish, and the manual screen-reader pass.

## Deploy notes (2026-07-11)

- Production Vercel project is under team `sanuske2-2147s-projects`; `ADxZimmy` is the required GitHub commit identity. `SESSION_SECRET` is configured on that project, so a push auto-deploys and does not fail closed. This corrects the earlier local-CLI (`nnazimuzoo`) account-boundary note, which was an incomplete view from a CLI that is not linked to the production project.
- The Phase 007 deploy applies a larger idempotent migration on the first authenticated action: the `order_events` table, 11 order/order-item pricing columns, and a one-time legacy `created`-event backfill.

## Blocked

- CLEARED 2026-07-11: Operator/investor demo approval. The D1 Demo Trust Gate passed 30/30 against production (`AUDIT-UAT-1784387883299-53b5tx`), so an unscripted demo is approved for the Demo Trust scope (PCO-001..009, 014, 016). This is a demo-readiness clearance only — not MVP readiness and not a certification claim.

- Item: 100/100 certification claim.
  Reason: Product remediation plus external email DNS/operator sign-offs, backup/restore or rollback drills, and manual evidence remain outstanding.

- Item: Dependable password recovery for operators (2026-07-19).
  Reason: Resend ACCEPTS the mail (valid key, real sender `alerts@pastrycounty.com`, message ids and sent_at timestamps for all three reset emails), but none reached a `delivered` event: two ended at `delivery_delayed` and one at `sent`. The receiving server for `pastrycounty.ng` is deferring mail from `pastrycounty.com`. Until that resolves, a locked-out operator may never receive a reset link. Owner action: check whether those messages later delivered or expired, and review SPF/DKIM/DMARC alignment between the two domains. PCO-015 stays closed for implementation; this is an operational/DNS dependency, not a code defect.

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

012-A is deployed and production-verified (`40751c7`, `220bdc1`, `becf7a2`). Hashed assets now carry `public, max-age=31536000, immutable` (previously `max-age=0, must-revalidate`, so every visit revalidated a 354 kB bundle); the HTML shell stays revalidating so deploys are picked up. A tracked CI workflow runs install, tests, build, dependency audit, whitespace check and an enforced gzipped bundle budget on every push and pull request, with no production credentials. First green run: 9/9 steps.

MEASUREMENT CHANGED THE PLAN. `npm run perf:baseline` found the client bundle is already 96.3 kB gzipped -- inside the audit's own 150 kB budget, because the audit quoted the uncompressed 334 kB figure. Route splitting (012-B) therefore buys far less than assumed. The real cliff is `/api/bootstrap`: 448.9 kB of JSON in 1189 ms, roughly half of it history no page needs on first paint (auditLogs 110 kB, inventoryMovements 65 kB, ingredientBatches 49 kB) -- and several of those collections are ALREADY silently truncated by server-side LIMITs, so the payload is both too large and incomplete, with nothing telling the operator their history view is cut off.

CI immediately caught two defects: `vercel.json` rejected the `"//"` comment keys I added (schema-validated, so the first deploy failed silently and kept old headers), and the committed lockfile cannot produce a clean install on Linux (platform-skewed optional deps), meaning `npm ci` was never reproducible across platforms.

OWNER DECIDED: skip the App.tsx refactor. 012-B was reduced to what the evidence still justifies -- the server-only document parsers were verified absent from the client bundle (mammoth, pdf-parse, read-excel-file, @napi-rs/canvas: zero occurrences) and that isolation is now a CI-enforced guard rather than an assumption.

012-C PART 1 IS DEPLOYED AND VERIFIED (`60b63c3`, `3535101`): `GET /api/data/{summary,orders,audit,movements}` with keyset pagination (cursor on `(created_at, id)`, so rows inserted mid-pagination cannot skip or duplicate), clamped page sizes, and one shared projection layer that a test holds in agreement with what bootstrap withholds. `smoke:route-data` passes 20/20 live, including a temporary Viewer getting 403 on the audit trail with no rows leaked while still reading operational data.

THAT WORK QUANTIFIED A CORRECTNESS DEFECT: the summary endpoint counts 1458 audit rows and 962 inventory movements, while bootstrap returns 100 and 200. Operators have been seeing roughly 7% of the audit trail and 21% of stock movements, with nothing indicating the view is truncated. The performance work uncovered a data-honesty problem, and it is the strongest reason to finish the migration off bootstrap.

A deploy failure is recorded in the phase verification: adding the endpoint took the deployment to 13 serverless functions, one over the limit, so the build failed while every existing route kept working -- which reads like a routing bug rather than a failed deploy. Root cause was two non-underscore test files in api/ that Vercel had been deploying as live functions all along; `.vercelignore` now excludes them.

012-C PART 2 IS UNDERWAY. The audit trail is migrated off bootstrap (`b7cd122`) and the payload fell from 448.9 kB to 342.1 kB -- 106.8 kB, 23.8%, from one collection. More importantly the truncation is fixed and admitted: the page now reads "Showing 50 of 1,485 audit entries" with a Load older entries control and an explicit note that search and filters only see loaded rows. Ingredient pages fetch their own history by entityType/entityId instead of filtering a truncated global copy. Loading, error and empty states were designed against the UI skill's checklist: the skeleton reserves row height so nothing shifts, errors use role="alert" with a retry, and superseded responses cannot overwrite newer data. Verified live: route-data 20/20, all 7 browser smokes green, and a browser check of the migrated page.

Lots and movements are migrated too (`3e5466b`, `496a238`, `b00a019`). BOOTSTRAP IS NOW 259.6 kB, DOWN FROM 448.9 kB -- 189.3 kB, 42% removed.

Neither collection could simply be dropped. Lots feed expiry notifications and the FEFO report, computed synchronously; movements are read by cancellationConsequences and reservationQuantityForOrder to resolve a live order's reservations, so dropping them would have made the cancel modal stop reporting that a reservation gets released -- the exact dishonesty PCO-009 fixed. Both were narrowed to what that logic actually reads (60 soonest-expiring lots; reservation rows for non-archived orders) and everything else moved to /api/data/*, leaving each consumer more correct than before. Dashboard "Waste Events" and "Most used ingredient" are now database aggregates over every row rather than over whatever fitted in the last 200 movements, where "most used" silently meant "most used recently".

`smoke:regression-audit` caught a real regression: it asserted FEFO by finding its test lot in the snapshot, and a new lot with no expiry sorts last so never made the 60-row cut. It now reads from /api/data/batches?ingredientId=, the same complete source the ingredient page uses. Verified first that no remaining app code reads per-ingredient lots from the snapshot.

Verified: 234/234 unit, route-data 20/20, all 7 browser smokes, and the D1 gate still 30/30.

Note `recipeItems` is now the largest item at 108.7 kB but is NOT growth-capped, so it needs per-recipe loading rather than pagination. Then part 3: move remaining request-path ALTER/CREATE/repair work into explicit idempotent migrations with a deploy preflight (RS-007). Then 013 accessibility, then 014 real AI (optional, gated on a provider/retention/budget decision). 015-B (full UAT + fresh external audit) stays last, after 011-014.

Deployed and production-verified 2026-07-11: S0/006a, Phase 007, Phase 008, Phase 009-A, the 009-B gram-rounding increment, AND the 009-B deduction-stage wiring (`18d2c69`) — a stage-toggling probe proved stock deducts EXACTLY ONCE at the configured stage (confirmation / production_start / completion), never twice. `main` synced with origin at `18d2c69`. Remediation: 9 of 16 PCO findings fully closed; PCO-006 closed; PCO-007 mostly closed (gram rounding + deduction stage effective; negative inventory + full settings inventory remain).

## Phase 008 status (implemented locally 2026-07-11, complete)

- 008-A `376509b`: Africa/Lagos production eligibility + corrected Today/Tomorrow/This Week buckets; server-enforced order state machine `isValidOrderTransition` (PCO-004, PCO-005 lifecycle).
- 008-B `b17c05f`: `production_runs` table with `unique(order_id)`; produceOrder claims the run as the first transaction statement so a concurrent/repeat completion fails with 23505 and rolls back (idempotent `alreadyProduced`, no double deduction); batch completion routes through a confirmation modal with a current->deducts->resulting-stock preview (PCO-005 completion).
- 008-C `6b44f0b`: `cancellationConsequences` helper; cancellation requires a reason (recorded on event + audit) and is blocked after deduction; consequence-aware cancellation modal (PCO-009).
- Local gates green: 131/131 tests, build clean. DB-level behavior (migration, idempotency, filters, cancellation) pending the production smoke.

Phase 007 shipped 2026-07-11: pushed the four 007 commits + merge `add3079`, then hotfix `a75c688` after the first build 500'd `/api/bootstrap` (ambiguous `created_at` in the new order_events join). `smoke:live-audit` is green; bootstrap returns 200 with orderEvents + pricing fields.

PHASE 013 STARTED. Slice 013-A is deployed and production-verified (`a6189a6`, `d94fdfb`). PCO-013 confirmed by measurement rather than assumption: the caramel link colour was 3.92:1 on the page background and 4.03:1 on surfaces against a 4.5:1 AA requirement, and bottom-nav labels were 10.5px. Caramel is now #af5714 (4.68:1 / 4.81:1 -- the nearer 4.54:1 candidate was rejected for sitting on the line) and nav labels are 11.5px/700. Verified live in the deployed stylesheet.

Two permanent gates: `npm run a11y:contrast` computes ratios from the real :root tokens and runs in CI, and `npm run smoke:a11y` drives the app with axe-core. Live result 25/25 -- axe clean on Login, Dashboard, Inventory, Orders, Production and Recipes; every control accessibly named; focus indicators present; skip link present; no horizontal overflow and legible nav labels at 360/390/414px.

Caught one of my own checks passing for the wrong reason: the pointer-only row test looked for tr[onclick], which React never emits, so it could not have detected the pattern the audit flagged. Rewritten to look for rows styled cursor:pointer containing nothing focusable. Still zero, but now evidence.

NOT claimed: the manual keyboard-only walkthrough and NVDA/VoiceOver pass are owner work; automated axe catches roughly half of real defects.

STOCK HOLD FLOW ADDED 2026-07-19 on the owner's instruction (`dd390d3`, `c86f660`), outside the audit programme.

The problem: deducting only at production completion meant a shortage caused by a SECOND order was discovered after the first had already been baked. Stock is now HELD when an order is confirmed. Holding is not deducting -- ingredients stay on the shelf and still leave stock exactly once, at the configured deduction point, which already released the hold in the same statement.

Most of the machinery already existed and was correct (reserved_stock, reservation/release movements, availability that subtracts holds, release on cancel, deduction that converts hold to consumption atomically). The only gap was the window between confirming an order and starting production. Confirmation reports a shortage but does NOT block, because a kitchen must be able to accept an order it still needs to shop for; production start still blocks. Drafts hold nothing; produced/delivered/cancelled orders are never re-held.

Configurable via a new `stockHoldStage` setting: order_confirmation (new default), production_start (previous behaviour), none.

Live probe against production: 10/10. Order A confirmed -> stock 1000, held 400 (withheld, not deducted). Order B needing 800 with only 600 free -> ACCEPTED and flagged Shortage. Holds never exceeded physical stock. Cancelling B returned its hold. D1 gate still 30/30 with exact deductions unchanged, and all 7 browser smokes green.

DEFECT I INTRODUCED AND FIXED: the new settings column cannot be created automatically, because Phase 012 moved schema changes into scripts/migrate.mjs and that has not run against production (no DATABASE_URL here). Reading or writing it would have broken order.save, order.status, settings.save and bootstrap. Every access now tolerates the column's absence and falls back to the default; bootstrap no longer selects it. The feature ships fully working on the default. Running `npm run db:migrate` makes the stage persistent and configurable.

ASSISTANT KEYS ARE NOT SET IN PRODUCTION. Checked via /api/health, which now reports provider, model and which variable supplied the key -- never the key. It accepts ASSISTANT_API_KEY, ANTHROPIC_API_KEY or OPENAI_API_KEY and reports configured:false for all three, so no assistant key exists on this project. Given the earlier account-boundary confusion, they may be set on a different Vercel project.

MIGRATIONS APPLIED TO PRODUCTION 2026-07-19 (`98606b7`, `4e7cabd`). All six steps recorded in `schema_migrations`; re-running is a verified no-op (ran: [], skipped: all six).

There is no database credential in this environment and a connection string should not be copied around to work past that, so the migration runs through the app instead. `schema.ensure` -- Owner/Admin only, authenticated, audited -- applies the same step list as the CLI runner, using the server's own credential. RS-007 forbids schema mutation on ORDINARY requests; an explicit authorised admin action is the deliberate operation that rule carves out. `{ check: true }` reports applied/pending without changing anything.

The step list now lives in `api/_migrations.js` so the CLI runner and the admin action cannot drift into applying different things.

Verified after applying: `stockHoldStage` persists a round trip and reads back through bootstrap as `order_confirmation`, with `defaultDeductionStage` still `production_completion` -- hold at order confirmation, deduct at production completion, which is the configuration the owner asked for. D1 gate 30/30, all 7 browser smokes green.

SMOKE FLAKINESS WORTH KNOWING: `smoke:milestone7` failed three times in a row at three DIFFERENT buttons with 30s click timeouts, then passed cleanly. Before accepting it as flaky I checked the two plausible real causes and ruled both out by measurement: Inventory renders 78 rows in production, and the enlarged bottom-nav labels from 013-A obscure ZERO controls (nav 72px against 104px clearance). Driving the exact failing sequence by hand works. Treat a single milestone7 click timeout as environmental and re-run; treat a repeated failure at the SAME step as real.

015-B FULL UAT GATE PASSED 2026-07-19 (`8a19e66`, `2c6b55f`). `npm run smoke:uat-full` runs 9 gates and reports one verdict: unit/policy/permission suites (316 tests), contrast, bundle budget, Demo Trust UAT, cookie/CSRF/throttling, password reset, route-scoped reads, rendered accessibility, and the full browser regression family. ALL NINE PASSED against production.

The gate composes the suites that already prove each area rather than re-implementing their assertions, because a second copy drifts from the first -- the failure mode this programme hit twice (a smoke asserting a stale contract, and a check written so it could never match what it tested). It stops at the first failure rather than piling production side effects onto a broken state.

New permanent suite: `api/permission-matrix.test.js`, 42 checks. The action list is derived from the source at test time, not copied, so a new action cannot be added without a role decision. A Viewer can reach NO mutating action; no absent, empty, spoofed, mis-cased or whitespace-padded role satisfies any check.

`docs/audit-handoff.md` rewritten around the 54/100 baseline: finding -> phase -> commit -> evidence for all 16 PCO and 7 RS findings, reproduction commands, the defects the gates themselves caught, and eight limitations deliberately NOT claimed. No replacement score is claimed; the June 96/100 is marked superseded.

REMAINING IS OWNER ACTION: request the fresh independent audit. Everything an auditor needs is prepared and reproducible with `npm run smoke:uat-full`.

## Catch-up and rerun 2026-08-17

Local `main` was 64 commits behind and fast-forwarded to `4c7e98c`; no open PRs or issues, and `origin/main` is the only branch. `.planning/ROADMAP.md` was a month stale — it still listed Phases 012, 013, 014 and the 015-B gate as planned — and was reconciled with delivered state in `e1e9702`.

CI had gone red on a docs-only commit. The cause was three advisories published during the idle month (`postcss` high, `nanoid` high, `body-parser` low), all transitive with non-major fixes, cleared in `79b2248`. Because `postcss` generates the CSS, the bundle was measured rather than assumed: the build emits byte-identical output, same content hashes, entry JS 97.9 kB and CSS 5.4 kB unchanged. Worth knowing: `npm audit fix` also moved `@emnapi/*`, the exact packages phase 012 recorded as platform-skewed, but CI on Linux passed because the pipeline runs `npm install` rather than `npm ci`.

THE FULL UAT GATE PASSED 9/9 AGAIN on 2026-08-17 — but only on the second attempt, and the first failure is the important part.

`smoke:live-audit` passed all seven browser smokes and then failed in TEARDOWN: `app_sessions_user_id_fkey` is NO ACTION, and `removeSmokeUser()` deleted the temporary user without clearing the session rows the runner's own login had created. Since RS-006 the runner signs in itself, so it manufactures the exact row that blocks its own cleanup.

THE REASON IT WAS NEVER CAUGHT MATTERS MORE THAN THE BUG. `useTemporaryUser` is `Boolean(databaseUrl)`, and until 2026-08-17 there was no `DATABASE_URL` in this environment. So the temporary-user path never ran AND `assertCleanup()` returned early printing "skipped". The 2026-07-19 gate proved the seven smokes but did NOT prove cleanup; the assertion was inert. The defect had been latent since Phase 011 created `app_sessions` on 2026-07-11. That is the third check in this programme found to be passing for a reason other than the one claimed.

One `codex-smoke-%` Owner/Admin row with three unrevoked sessions sat in production for about an hour. No credential was recoverable — the random password died with the process and only token hashes are stored — but the row should not have existed. Removed on the owner's instruction and verified zero.

The FK was deliberately NOT changed to ON DELETE CASCADE. The only `delete from app_users` in the codebase is this smoke's teardown; the app deactivates users via `active` and never hard-deletes one, so cascading a live constraint to suit a test would weaken a real guarantee to obtain a pass. The teardown clears its own dependents instead. The rerun then verified cleanup with a temporary user for the first time.

NPM CI RESTORED 2026-08-17. The lockfile skew that forced CI onto `npm install` is gone, and not by the Linux regeneration the phase 012 note anticipated: the dependency bump in `79b2248` hoisted `@emnapi/core` and `@emnapi/runtime` to 1.11.3, the versions Linux was already resolving, which removed the divergence as a side effect. The `@emnapi` movement flagged as a risk when that bump landed turned out to be the fix.

Proven on both platforms before the step was restored, because the whole point of the original finding was that this had never actually been reproducible: `npm ci` installs cleanly on Linux (node 22 / npm 10.9.8, 248 packages) and Windows (node 24 / npm 11.9.0, 245 packages), differing only by platform-conditional optional dependencies, and the full CI sequence runs green on Linux from a clean `git archive` checkout in a node:22-slim container — install, 316 tests, build, audit, contrast, bundle budget. The Linux build emits BYTE-IDENTICAL assets to the Windows one (`index-DX7-Mvcy.css`, `index-B36g1KXT.js`), which is the real evidence of reproducibility.

`npm ci` is now its own guard: a lockfile that drifts out of sync with package.json fails the step instead of being quietly resolved around.

VERCEL ALIGNED TO NPM CI on the owner's instruction, in the same pass. `vercel.json` now sets `installCommand: npm ci`, so CI and production install identically and a deploy gets exactly the dependency tree CI verified. This closes the phase 012 residual risk about install drift completely, rather than for CI only.

The accepted cost is deliberate: a lockfile that ever falls out of sync with `package.json` now fails the build instead of being quietly resolved around. That is the point — silent resolution is how the original skew survived a month unnoticed. A failed build is also not an outage; the previous deployment keeps serving, as this programme already observed when the serverless function-count limit broke a build during 012-C part 1.

THE GATE PASSED A THIRD TIME (`e1cbf59`), against the `npm ci`-built production. That run is what makes the install change verified rather than merely deployed: the checks taken immediately after that deploy were a health response and an asset-hash comparison — sound, but neither exercised the application. The third run drives it end to end on that build, and cleanup verified zero for a second consecutive time, so the teardown fix holds rather than having passed once by coincidence. `smoke:live-audit` took 72s in both runs, a small signal that installing from the lockfile changed no runtime behaviour.

Three gate runs on 2026-08-17, in order: FAILED in teardown with all seven browser smokes passing; 9/9 after the teardown fix; 9/9 against the `npm ci` build.

`.planning/ROADMAP.md` was updated twice today (`e1e9702`, `e92b090`) — first to reconcile it with delivered state, then to record this maintenance under its own section, stating plainly that none of it moved the programme. Both files now agree on where the work actually stands, which they did not this morning.

## Phase 016 Device Accounts — complete 2026-08-17

Delivered outside the audit-remediation programme, on the owner's instruction: hand the app to several testers, each with their own account and their own EMPTY kitchen, and keep their recipes out of the central database because that was going to be their first concern.

Login stays central. Every signup lands in `app_users`, appears on the owner's Staff page, and `user.disable` locks it out immediately. The kitchen data does not: it lives in the tester's browser, and the server refuses a device account every business read and write.

THE FENCE IS `data_mode`, NOT ROLE. Device accounts hold Owner/Admin so the app's own permission gating works inside their workspace — which means every role check passes for them and this one column is all that stands between a tester and the bakery's records. That is why it is enforced at the two chokepoints every business path already flows through (`requirePermission` covers all 31 actions plus `produceOrder`; `requireActiveSession` covers bootstrap and all five `/api/data` resources), and why each refuses TWICE: once on the session actor before any query, then again on the stored row, because an actor built from a bearer token carries no data mode.

Two actions stay on the server because a browser cannot do them, and both needed a device branch to stop tenant data crossing. Document import normally reads the bakery's ingredient, recipe and supplier names as matching context — a device caller sends its own instead and no business table is touched. Low-stock email normally derives recipients from the bakery's staff — a device alert goes to the one address proven by signing in, and writes no notification or audit row.

SIGNUP REFUSES 503 RATHER THAN INSERTING WITHOUT THE COLUMN. That is what makes every "missing column means server mode" fallback safe rather than merely tolerable: no device account can exist before migration 007, so the default is provably correct. Inserting without it would have created a server-mode Owner/Admin, the worst outcome of a missed migration.

THE TRAP AVOIDED IN THE CLIENT ENGINE: `src/lib/kitchen.ts` already computes recipe requirements and reusing it was the obvious shortcut. It applies display rounding — whole eggs, ceil for pcs, one decimal elsewhere — before summing, which is right for a preview and wrong for a deduction. The server rounds nothing. The engine ports the server's formula; kitchen.ts stays the preview.

Idempotency is a storage constraint on both sides. A production claim is written with IndexedDB `add()` on a store keyed by orderId, so a repeat or concurrent completion raises ConstraintError and aborts the whole transaction with no stock moved — what `unique (order_id)` does in Postgres.

TWO DEFECTS THE TESTS CAUGHT. `runTransaction` was wrapping ConstraintError in a generic error, which would have turned "already produced" into an unexplained failure. And `api/_actions.js` kept a local `isMissingColumn` while importing the shared one: vitest's transform accepted it, plain Node refused the module outright — a 500 on every route. Module loading is now checked directly rather than inferred from a green suite.

TWO GUARDS PROVEN TO BITE, rather than trusted: the FEFO assertion was run against a reversed comparator and failed on the exact lot quantities; the serverless function-count guard was run against a limit of 11 and failed with its consolidation advice. The deployment sits at 12 of 12 functions, so the next endpoint must collapse `api/auth/*` into one dispatcher.

PROVEN AGAINST PRODUCTION: `smoke:device-account` 32/32 (run `DEVICE-SMOKE-1786983888749-g8mytw`). A real device account was refused bootstrap, all five data resources and every write including `schema.ensure`; the two allowed actions worked with the alert reaching only the tester; the database held zero movements, order events, notification rows, orders, ingredients or recipes for it; the single audit row was its own signup. Disable locked it out at 401 and cleanup left nothing. `smoke:uat-full` then passed 9/9, so the existing kitchen is undisturbed. The smoke is now the tenth gate in that runner, and exits non-zero on a missing credential rather than skipping — an optional privacy check is one that quietly stops running.

Bundle cost to everyone else: the engine is behind a dynamic import, so it is a 13.9 kB gzipped lazy chunk and the entry grew 97.9 -> 100.5 kB. The budget script proves that placement, requiring the marker to be PRESENT in a lazy chunk as well as absent from the entry one, because an absence check alone passes by finding nothing anywhere.

`SIGNUP_INVITE_CODE` is set, so signup is open to invite holders. Removing it and redeploying closes it.

A SIGNUP SCREEN WAS MISSING AND IS NOW BUILT (2026-08-17). The endpoint, the guards and the engine all shipped and were proven against production, but nothing in the app ever reached the endpoint: there was no signup page and no link to one, so the feature was unusable by the people it was for. Caught by the owner opening the site, not by any gate — none of them drive the signed-out UI. Fixed with a `signup` route, a Create Your Kitchen screen and a link under the login button, and the render guard had to learn the route too: an unauthenticated visitor on any page outside the welcome/login/reset allow-list fell through to the login form, so the first attempt changed the URL and rendered nothing new. Verified in a real browser this time — both navigation directions, both client-side validations, and a 375px viewport with no horizontal overflow and no touch target under 44px.

THE DOCS ARE SPLIT BY AUDIENCE after the first version was too technical to hand anyone. `docs/device-accounts.md` is the tester's: plain language, no configuration, no internals, and honest about the two things that still transit the server, about backups being the only safety net, and about the data not being encrypted on their device. `docs/device-accounts-owner.md` carries the operational half — opening and closing signup, rotating the code, the disable switch, provider quota exposure, and the 12-of-12 function ceiling.

`docs/audit-handoff.md` now says plainly that the audited surface changed after the 015-B gate — a public unauthenticated endpoint, a second authorization dimension, and a client-side engine, none of it covered by the 9/9 evidence.

## Verification Snapshot

### Current (2026-08-17, phase 016)

- Command/check: `npm run smoke:device-account` — the device-account privacy proof (production)
  Result: **PASSED 32/32**, run `DEVICE-SMOKE-1786983888749-g8mytw`. Device account refused bootstrap, all five `/api/data` resources and every write including `schema.ensure`; the two allowed actions worked with the alert reaching only the tester; zero rows attributable to it in movements, order events, notifications, orders, ingredients or recipes; one audit row, its own signup; disable locked it out at 401; cleanup `{"accounts":0,"sessions":0,"auditRows":0}`.
- Command/check: `npm run smoke:uat-full` after phase 016 (production)
  Result: **PASSED 9/9.** The existing kitchen is undisturbed by device accounts.
- Command/check: `npm test`
  Result: Passed; **519/519 across 16 files** (401 before phase 016).
- Command/check: `npm run perf:budget`
  Result: Passed; entry JS 100.5 kB / 150 kB, device engine present in a lazy chunk and absent from the entry chunk, 12/12 serverless functions.
- Command/check: migration `007-app-users-data-mode` (production)
  Result: Applied. Column present, default `'server'`, all 89 existing accounts read as server mode. `smoke:auth-cookie` 35/35 immediately afterwards.

### Earlier the same day (`e1cbf59`)

- Command/check: `npm run smoke:uat-full` — the 015-B full gate (production)
  Result: **PASSED 9/9**, twice — after the teardown fix, and again against the `npm ci`-built production. `test` 15s, `a11y:contrast` 1s, `perf:budget` 1s, `smoke:uat-core` 24s, `smoke:auth-cookie` 10s, `smoke:password-reset` 12s, `smoke:route-data` 9s, `smoke:a11y` 29s, `smoke:live-audit` 72s. Cleanup verified `{"smokeUsers":0,"activeSmokeIngredients":0,"fefoOverstatements":0}` on both runs — the first two times that assertion has executed against a temporary user rather than skipping.
- Command/check: `npm test`
  Result: Passed; **316/316 across 11 files**. Supersedes the 114/114 Phase 007 figure below.
- Command/check: `npm run build`
  Result: Passed; `index-B36g1KXT.js` 359.52 kB / 101.16 kB gzip, `index-DX7-Mvcy.css` 22.85 kB / 5.53 kB gzip. Identical content hashes on Windows and on Linux in a `node:22-slim` container, which is the reproducibility evidence.
- Command/check: `npm run perf:budget`
  Result: Passed; entry JS 97.9 kB / 150 kB, entry CSS 5.4 kB / 30 kB. Server-only parsers (mammoth, pdf-parse, read-excel-file, @napi-rs/canvas) absent from the client bundle.
- Command/check: `npm audit --audit-level=moderate`
  Result: Passed; **0 vulnerabilities** after `79b2248` cleared postcss, nanoid and body-parser.
- Command/check: `npm run a11y:contrast`
  Result: Passed; every pair above its AA threshold, nav labels 11.5px.
- Command/check: `npm ci` cross-platform
  Result: Passed on both. Linux node 22 / npm 10.9.8 → 248 packages; Windows node 24 / npm 11.9.0 → 245 packages, differing only by platform-conditional optional dependencies. Full CI sequence green on Linux from a clean `git archive` checkout.
- Command/check: production probes after the `npm ci` deploy (`0b81bc8`)
  Result: Passed. `/api/health` ok with `sessionSecret: "configured"`; the deployed shell references `index-B36g1KXT.js` and `index-DX7-Mvcy.css` — the same hashes built locally and in the Linux container; assets carry `public, max-age=31536000, immutable`.

### Historical

- Command/check: `npm.cmd test` (Phase 007)
  Result: Passed; 114/114 tests across 6 files (94 at 006a, +20 across Phase 007). Superseded by the 316/316 figure above.
- Command/check: `npm.cmd run build` (Phase 007)
  Result: Passed; Vite production build clean (JS ~339.7 kB / 95.4 kB gzip). Superseded above.
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
