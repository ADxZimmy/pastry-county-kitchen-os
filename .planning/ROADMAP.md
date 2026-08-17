# Roadmap

Revised 2026-08-17, twice. The first pass reconciled this file with delivered state at `4c7e98c`, because the previous revision (2026-07-11) predated Phases 012, 013, 014-A and the 015-B gate and still listed them as planned. The second pass, at `e1cbf59`, records the maintenance that followed — see **Maintenance** below. Phase identifiers 007-015 remain stable, and the risk-gated execution order below was followed as written. Full traceability is in `.planning/AUDIT-REMEDIATION.md`; per-phase evidence is in `.planning/phases/*/VERIFICATION.md`.

**The audit-remediation programme's position is unchanged.** The maintenance below is upkeep and re-verification; it closed no findings and moved no phase. Phase 016 Device Accounts is new work delivered outside that programme, and the 015-B gate evidence predates it — `docs/audit-handoff.md` says so explicitly, because an auditor scoping from that document would otherwise miss a public endpoint, a new authorization dimension, and a client-side engine.

## Execution Order

1. `006a` Immediate Security Containment.
2. `007` Truthful Orders And Financials.
3. `008` Production Transaction Safety.
4. `009` Validation, Settings And Unit Policy.
5. `010` Conversion Apply And Honest Helper.
6. `015-A` Authenticated Demo Trust UAT.
7. `011` Auth And Session Hardening.
8. `012` Performance And Loading Architecture.
9. `013` Accessibility And UX Uplift.
10. `014` Real AI Orchestration, after an explicit provider/data-retention decision.
11. `015-B` Full Authenticated UAT And External Audit Rerun.

All eleven steps are executed. `014` stopped at its decision-and-contracts slice by design, gated on a provider key.

## Now

- Nothing in flight.
  Every product phase in the audit-remediation programme is deployed and production-verified, and the 015-B full UAT gate passed 9/9 on 2026-07-19. The programme is blocked only on owner action, not on engineering.

## Owner Action (blocks programme closure)

- Action: Commission the fresh independent audit.
  Why it blocks: 015-B's final step is an external audit rerun against the 54/100 July 10 baseline. It cannot be self-served.
  Prepared: `docs/audit-handoff.md` carries finding -> phase -> commit -> evidence for all 16 PCO and 7 RS findings. An auditor reproduces the state with `npm run smoke:uat-full`.

- Action: Manual keyboard-only walkthrough and an NVDA/VoiceOver pass, recorded with assistive-technology versions.
  Why it blocks: automated axe catches roughly half of real accessibility defects. No screen-reader claim is made anywhere in this programme without it. (Phase 013 plan step 10.)

- Action: Resolve mail delivery between `pastrycounty.com` and `pastrycounty.ng` (SPF/DKIM/DMARC alignment).
  Why it blocks: Resend accepts reset mail and returns message ids, but two of three test messages ended `delivery_delayed` and one at `sent` — none reached `delivered`. A locked-out operator may never receive a link. PCO-015 is closed for implementation; this is an operational/DNS dependency, not a code defect.

- Decision: Whether to configure an assistant provider at all, and on whose retention terms.
  Why it blocks 014-B/C: recipes and costs are commercial IP, and code cannot enforce a third party's policy.

## Optional Engineering (nothing failing behind it)

- Phase: 014-B/C Real AI Orchestration, remaining slices.
  Outcome: server endpoint on Phase 011 cookie/CSRF primitives, read-only tools, bounded session context, provider adapter network calls, UI and review routing, authenticated smoke.
  Status: Written but unprovable until `ASSISTANT_PROVIDER` and `ASSISTANT_API_KEY` exist. `/api/health` currently reports `configured: false` for all three accepted variable names. No AI capability claim may be made before this is proven.

- Phase: 013 cosmetic polish (plan steps 7-8).
  Outcome: mobile production card scan hierarchy; builder form ergonomics (collapsible ingredient rows, duplicate action, sticky Add ingredient, item count).
  Status: Deferred. No failing check sits behind either item. Search and scroll position are still not preserved across detail round trips; only the filter is.

- Phase: 012 optimisation leftovers.
  Outcome: per-recipe loading for `recipeItems` (108.7 kB, 266 rows — not growth-capped, so pagination is the wrong tool); moving Dashboard and Orders onto the existing `/api/data/summary` and `/api/data/orders`; Lighthouse budgets behind an authenticated performance job.
  Status: Optimisation, not defect repair. The current snapshot-driven versions are correct and bounded. A public login-page Lighthouse score is explicitly not evidence for the authenticated app.

## Completed Gates

- Gate: 015-B Full Authenticated UAT And External Audit Rerun
  Outcome: one command, nine gates, one verdict — unit/policy/permission suites (316 tests), contrast, bundle budget, Demo Trust UAT, cookie/CSRF/throttling, password reset, route-scoped reads, rendered accessibility, and the full browser regression family.
  Status: **PASSED 9/9** against production 2026-07-19 (`8a19e66`, `2c6b55f`, `4c7e98c`) via `npm run smoke:uat-full`, and **re-verified 9/9 twice on 2026-08-17**. Adds the permanent `api/permission-matrix.test.js` (42 checks, action list derived from source at test time so a new action cannot ship without a role decision). `docs/audit-handoff.md` rewritten around the 54/100 baseline. **No replacement score is claimed** — the June 96/100 is marked superseded, and the external rerun is owner action above.
  Read the July result with one correction: its cleanup assertion never executed. `useTemporaryUser` is `Boolean(databaseUrl)` and no `DATABASE_URL` existed in the working environment until 2026-08-17, so the temporary-user path never ran and `assertCleanup()` returned early printing "skipped". July proved the seven browser smokes; it did not prove cleanup. The 2026-08-17 runs are the first to create a temporary Owner/Admin user, drive it through every smoke, tear it down and verify nothing was left behind.

- Gate: D1 Demo Trust / 015-A Authenticated Demo Trust UAT
  Outcome: core Prompt 10 create/edit/refresh/lifecycle checks pass against production with isolated, reversible, manifest-owned data.
  Status: PASSED 2026-07-11, 30/30 (`npm.cmd run smoke:uat-core`, run id `AUDIT-UAT-1784387883299-53b5tx`). Unscripted operator/investor demos are approved for the Demo Trust scope. Cleanup left no residue. Re-verified green after every subsequent phase.

- Phase: 006a Immediate Security Containment / S0
  Outcome: retired unauthenticated stock mutation, authorized maintenance before DDL, restricted `schema.ensure`, masked unexpected errors, and required a dedicated production session secret.
  Status: Deployed and production-verified 2026-07-11. Health, unauthenticated route probes, full live smoke, and cleanup passed. (RS-001..RS-004.)

## Completed — MVP Hardening Program

- Phase: 011 Auth And Session Hardening
  Outcome: opaque server-side sessions in HttpOnly cookies, CSRF protection, private/no-store responses, distributed auth throttling, and hashed single-use password-reset tokens. (PCO-012, PCO-015, RS-006)
  Status: COMPLETE, deployed and production-verified 2026-07-11 — 011-A (`e4fa6c3`), 011-B1 (`e86b654`, `ca7241d`), 011-B2 (`3e51dca`, `f21e89c`), 011-B3 (`5c149a6`, `66d3143`). Bearer credentials are retired; cookies are the only credential the API accepts. `AUTH_BEARER_COMPAT=on` remains only as an unsupported rollback lever.

- Phase: 012 Performance And Loading Architecture
  Outcome: immutable hashed assets, route-scoped paginated role-filtered endpoints, a shrinking bootstrap, schema changes moved off request paths, and a real CI gate. (PCO-010, PCO-011, RS-007)
  Status: COMPLETE for its defect scope, deployed and production-verified 2026-07-19 — 012-A (`40751c7`, `220bdc1`, `becf7a2`), 012-B reduced on evidence, 012-C part 1 (`60b63c3`, `3535101`), part 2 (`b7cd122`, `3e5466b`, `496a238`, `b00a019`), part 3 (`3c6f9be`). **Bootstrap fell 448.9 kB -> 259.6 kB, 42%.**
  Measurement redirected the phase twice, and both redirections are the point: the entry bundle was already 96.3 kB gzipped and inside the audit's own 150 kB budget — the audit's 334 kB figure was uncompressed — so the App.tsx refactor was dropped on the owner's decision as a large regression-prone change to a problem that did not exist, with the enforced CI budget keeping that honest. And the work uncovered a **correctness defect, not just a performance one**: operators had been seeing roughly 7% of the audit trail and 21% of stock movements behind silent server-side LIMITs, with nothing indicating truncation. That is fixed and now admitted in the UI ("Showing 50 of 1,485 audit entries" with a Load older control).

- Phase: 013 Accessibility And UX Uplift
  Outcome: AA contrast, legible mobile nav, promoted primary navigation, filtered dashboard deep links, and list-filter preservation across a detail round trip. (PCO-013 plus audit sections E/F)
  Status: COMPLETE for its defect scope, deployed and production-verified 2026-07-19 — 013-A (`a6189a6`, `d94fdfb`), 013-B (`df8ba52`), 013-C (`3af9c3b`). PCO-013 confirmed by measurement: caramel links were 3.92:1 on background and 4.03:1 on surfaces against a 4.5:1 AA requirement, nav labels 10.5px. Caramel is now `#af5714` (4.68:1 / 4.81:1 — the nearer 4.54:1 candidate was rejected for sitting on the line) and nav labels 11.5px/700. Two permanent gates: `npm run a11y:contrast` in CI computes ratios from the real `:root` tokens, and `npm run smoke:a11y` drives the app with axe-core (25/25 live). Cosmetic polish and the owner's manual pass are listed above.

- Phase: 014 Real AI Orchestration — slice 014-A only
  Outcome: owner decision record and assistant contracts — provider-neutral adapter, allow-list redaction, untrusted-notes quoting, a response contract under which a model cannot propose a write, and a clamped budget. (PCO-003 full closure remains open.)
  Status: 014-A committed 2026-07-19 (`773adeb`, `0e4a9a0`, with `a949ac1` and `f3a73f0` for health reporting and vendor key names). It contacts no provider, needs no key, and **changes no behaviour** — unconfigured is a supported state and the deterministic Kitchen Helper still answers. 27 contract tests. 014-B/C are in Optional Engineering above, gated on the owner's provider decision.

## Completed — Demo Trust Program

- Phase: 007 Truthful Orders And Financials
  Outcome: real per-order event history and actor attribution; server-canonical pricing and totals; data-derived dashboard guidance; no hard-coded 18,000 or mojibake. (PCO-001, 002, 014, 016)
  Status: Deployed and production-verified 2026-07-11 (`85ee60e`, `596ca01`, `c1c958e`, hotfix `a75c688`).

- Phase: 008 Production Transaction Safety
  Outcome: correct timezone-aware queues; server-enforced lifecycle; locked, atomic, idempotent completion; explicit QC/confirmation; safe cancellation policy. (PCO-004, 005, 009)
  Status: Deployed and production-verified 2026-07-11 (`376509b`, `b17c05f`, `6b44f0b`).

- Phase: 009 Validation, Settings And Unit Policy
  Outcome: client/server validation, a genuinely shared policy module, effective or explicitly retired settings, and divisible-unit rules. (PCO-006, 007, 008)
  Status: Deployed and production-verified 2026-07-11 (`6d33a07`, `09890d5`, `e8a733f`, `18d2c69`, `7abc4bc`).

- Phase: 010 Conversion Apply And Honest Helper
  Outcome: conversion actions truthfully distinguish saving a rule from changing a recipe; recipe changes use review, confirmation, provenance, audited persistence, and reload verification; the deterministic assistant is labelled Kitchen Helper. (PCO-003 demo closure)
  Status: Deployed and production-verified 2026-07-11 (`926861a`, `e4d3f1e`, `0511095`). Model-backed assistance remains Phase 014 and optional.

## Delivered Outside The Programme

- Change: Stock hold at order confirmation (2026-07-19, `dd390d3`, `c86f660`, on owner instruction).
  Outcome: deducting only at production completion meant a shortage caused by a second order was discovered after the first had already been baked. Stock is now held when an order is confirmed — holding is not deducting, and ingredients still leave stock exactly once at the configured deduction point. Confirmation reports a shortage but does not block, because a kitchen must be able to accept an order it still needs to shop for; production start still blocks. Configurable via `stockHoldStage` (order_confirmation default, production_start, none). Live probe 10/10.

- Change: Production schema migrations applied (2026-07-19, `98606b7`, `4e7cabd`).
  Outcome: all six steps recorded in `schema_migrations`; re-running is a verified no-op. There is no database credential in this environment, so the migration runs through the app: `schema.ensure` is Owner/Admin-only, authenticated and audited, and applies the same step list as the CLI runner from `api/_migrations.js` so the two cannot drift. RS-007 forbids schema mutation on *ordinary* requests; an explicit authorised admin action is the operation that rule carves out. This closes the "run `npm run db:migrate` against production" item still listed under Remaining in `.planning/phases/012-performance-loading/VERIFICATION.md`.

## Delivered Outside The Programme — Phase 016 Device Accounts (2026-08-17)

- Phase: 016 Device Accounts
  Outcome: testers get their own accounts and their own empty kitchens, with the kitchen data kept in their browser rather than in this database. Login stays central — every signup appears on the owner's Staff page and `user.disable` locks an account out immediately.
  Status: **COMPLETE and production-verified.** Deployed across `a636198` (shared rules), `b193f87` (server guards and invite-gated signup), `c752de1` (the browser engine) and `9fe721b` (the privacy smoke and records). Migration `007-app-users-data-mode` applied; all 89 pre-existing accounts read as server mode with no behaviour change. `npm run smoke:device-account` passed **32/32** against production, and `npm run smoke:uat-full` passed **9/9** afterwards, so the existing kitchen is undisturbed.
  The fence is `data_mode`, not role: device accounts hold Owner/Admin so the app's permission gating works inside their own workspace, which means every role check passes for them and this column is the only thing between a tester and the bakery's records. It is enforced at `requirePermission` and `requireActiveSession`, twice each — once on the session actor before any query, then on the stored row, because a bearer-built actor carries no data mode.
  Two actions stay on the server because a browser cannot do them, both with device branches that read no business table: document import (matching context comes from the caller) and low-stock email (recipients are the caller alone).
  Full evidence and eight explicit non-claims in `.planning/phases/016-device-accounts/VERIFICATION.md`. Two audiences, two documents: `docs/device-accounts.md` is what a tester is handed (plain language, no configuration, no internals), and `docs/device-accounts-owner.md` carries the operational side — opening and closing signup, the disable switch, provider quota exposure, and the function-count ceiling.

- Owner action, now live: `SIGNUP_INVITE_CODE` is set, so signup is open to invite holders. Removing the variable and redeploying closes it again.

## Maintenance (2026-08-17)

Upkeep after a four-week idle period. None of it closes a finding or advances a phase; it is recorded because two items change how earlier evidence should be read.

- Change: Three dependency advisories cleared (`79b2248`).
  `postcss` 8.5.15 → 8.5.26 and `nanoid` 3.3.15 → 3.3.18 (both high), `body-parser` 1.20.5 → 1.20.6 (low), all published during the idle month and all transitive with non-major fixes. CI had gone red on a docs-only commit as a result. Because `postcss` generates the CSS, the bundle was measured rather than assumed: the rebuild emitted byte-identical output, same content hashes, entry JS 97.9 kB and CSS 5.4 kB unchanged.

- Change: `npm ci` restored on CI and production (`fbc568b`, `0b81bc8`).
  The lockfile skew that forced CI onto `npm install` was gone — cleared as a side effect of the advisory bump above, which hoisted `@emnapi/*` to the versions Linux already resolved, not by the Linux regeneration the 012 note anticipated. Verified on both platforms before restoring rather than inferred: `npm ci` installs cleanly on Linux (node 22 / npm 10.9.8, 248 packages) and Windows (node 24 / npm 11.9.0, 245 packages), and the full CI sequence passes on Linux from a clean checkout, emitting byte-identical assets to the Windows build. `vercel.json` was aligned in the same pass, so production installs the exact tree CI verified. This closes the phase 012 residual risk on install drift. Accepted cost: a lockfile out of sync with `package.json` now fails the build rather than being resolved around — which is the point, since silent resolution is how the skew survived a month.

- Fix: Live-audit smoke teardown (`ea47f64`, recorded in `3eab6a5`).
  `removeSmokeUser()` deleted its temporary user without clearing the session rows the runner's own login created, which `app_sessions_user_id_fkey` (NO ACTION) refuses. Latent since Phase 011 created `app_sessions` on 2026-07-11, and invisible because the cleanup assertion was inert (see the 015-B note above). It left one Owner/Admin row and three unrevoked sessions in production for about an hour; no credential was recoverable, and both were removed and verified zero. The foreign key was deliberately **not** cascaded — the app deactivates users via `active` and never hard-deletes one, so loosening a live constraint to let a test tear down cleanly would weaken a real guarantee.

**The pattern worth carrying forward:** this is the third check in the programme found to be passing for a reason other than the one claimed, after the stale phase-2 selector and the `tr[onclick]` pointer-row test React could never have matched. A green check is worth confirming actually ran.

## Later

- Phase: Certification Evidence Closeout
  Outcome: external SPF/DNS, controlled email delivery, backup/restore or rollback drills, keyboard/screen-reader sign-off, and manual operator evidence for a 100/100 certification claim.
  Status: Backlog. Also gates the mail-delivery owner action above.

- Phase: Post-MVP improvements backlog
  Outcome: configurable role-based mobile nav, offline production, purchase orders, supplier comparison, price history, stock-exhaustion prediction, waste analytics, recipe versions, and batch labels/print sheets.
  Status: Waiting until the audit rerun completes.

## Known Operational Notes

- `smoke:milestone7` is intermittently flaky: it failed three times in a row at three *different* buttons with 30s click timeouts, then passed cleanly. Both plausible real causes were ruled out by measurement (Inventory renders 78 rows in production; the enlarged 013-A nav labels obscure zero controls — 72px nav against 104px clearance). Treat a single click timeout as environmental and re-run; treat a repeated failure at the **same** step as real.
- CI and Vercel both install with `npm ci` as of 2026-08-17, so a deploy gets exactly the dependency tree CI verified. A lockfile that drifts out of sync with `package.json` now fails the build instead of being quietly resolved around; regenerate the lockfile and commit it rather than reaching for `npm install` to get past it. A failed build is not an outage — the previous deployment keeps serving.
- The live-audit smoke only creates a temporary user, and only checks its own cleanup, when a `DATABASE_URL` is present. Without one it silently falls back to the configured `LIVE_TEST_EMAIL` account and prints "skipped" for the cleanup assertion. A green `smoke:live-audit` therefore means less in an environment with no database credential; check which mode it ran in before treating it as full evidence.
