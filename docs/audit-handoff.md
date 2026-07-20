# Audit Handoff — Pastry County Kitchen OS

Prepared 2026-07-19 for a fresh independent audit.
Live URL: https://pastry-county-kitchen-os.vercel.app

## Baseline being remediated

**Pastry County Kitchen OS Expanded Production Audit, 2026-07-10: 54/100, "Not Ready".** Findings PCO-001 … PCO-016.

An earlier 96/100 audit (2026-06-22) exists. **It is superseded and must not be carried forward as a readiness signal** — it predates the findings below and covered a narrower scope.

**No replacement score is claimed here.** Only a fresh independent audit can set one. This document reports what changed, where the evidence is, and what remains unproven.

## How to reproduce the evidence

```bash
npm install
npm test                    # 316 unit, policy, contract and permission tests
npm run build               # type check and production build
npm run a11y:contrast       # WCAG AA ratios computed from the real CSS tokens
npm run perf:budget         # gzipped entry bundle + server-only parser isolation

# Live gates (need LIVE_TEST_EMAIL / LIVE_TEST_PASSWORD in .env.local)
npm run smoke:uat-full      # runs every gate below and reports one verdict
```

Every live gate is production-safe: each creates only records it owns under a unique run id and cleans up in a `finally` block. `smoke:uat-full` stops at the first failure rather than piling side effects onto a broken state.

Last full run, 2026-07-19, against production: **all 9 gates PASSED.**

| Gate | Covers |
|---|---|
| `test` | calculation, policy, role matrix, assistant contracts |
| `a11y:contrast` | PCO-013 |
| `perf:budget` | PCO-011 |
| `smoke:uat-core` | PCO-001..009, 014, 016 |
| `smoke:auth-cookie` | PCO-012, RS-006 |
| `smoke:password-reset` | PCO-015 |
| `smoke:route-data` | PCO-010 |
| `smoke:a11y` | PCO-013 |
| `smoke:live-audit` | end-to-end browser regression |

## Finding → phase → evidence

| Finding | What it was | Phase | Key commits | Evidence |
|---|---|---|---|---|
| PCO-001 | Fabricated order timeline | 007-A | `85ee60e` | `smoke:uat-core` — per-order events, real actor, no invented entries |
| PCO-002 | Hard-coded ₦18,000 everywhere | 007-B | `596ca01` | `smoke:uat-core` — orders net 7,500 and 40,000, never 18,000 |
| PCO-003 | Assistant claimed capabilities it lacked | 010, 014-A | `926861a`, `0511095`, `773adeb` | Bundle scan: no "AI Assistant"; conversion apply is reviewed, stale-safe, audited |
| PCO-004 | Order lifecycle not enforced | 008-A | `376509b` | `smoke:uat-core` — backwards transition refused 409 |
| PCO-005 | Double deduction possible | 008-B | `b17c05f` | `smoke:uat-core` — repeat produce returns `alreadyProduced`, stock unchanged |
| PCO-006 | Non-positive yield accepted | 009-A | `6d33a07` | `smoke:uat-core` — zero yield rejected 400 |
| PCO-007 | Settings that did nothing | 009-B | `09890d5`, `18d2c69` | Live stage-toggling probe: deducts exactly once at the configured stage |
| PCO-008 | Fractional counts of whole units | 009-C | `7abc4bc` | `smoke:uat-core` — 1.5 pack rejected, 1.5 kg accepted |
| PCO-009 | Unsafe cancellation | 008-C | `6b44f0b` | `smoke:uat-core` — reason required, produced-order cancel blocked 409 |
| PCO-010 | Monolithic growing payload | 012-C | `60b63c3`, `b7cd122`, `496a238` | Bootstrap **448.9 kB → 259.6 kB**, ~1,200 ms → ~700 ms; `smoke:route-data` 20/20 |
| PCO-011 | No caching, oversized bundle | 012-A | `40751c7`, `220bdc1` | Assets `max-age=0` → `immutable`; entry bundle 96.3 kB gzip, inside the 150 kB budget |
| PCO-012 | Session token readable by JavaScript | 011-A/B | `e4fa6c3`, `e86b654`, `66d3143` | `smoke:auth-cookie` 35/35; browser smoke asserts no credential in storage |
| PCO-013 | Contrast and legibility below AA | 013-A | `a6189a6` | Link contrast **3.92:1 → 4.68:1**; nav labels 10.5 → 11.5px; `smoke:a11y` 25/25 |
| PCO-014 | Static invented guidance | 007-C | `c1c958e` | Data-derived restock guidance |
| PCO-015 | Password reset was a placeholder toast | 011-B2 | `3e51dca`, `f21e89c` | `smoke:password-reset` 16/16 — hashed single-use tokens, no enumeration |
| PCO-016 | Mojibake in shipped text | 007-C | `c1c958e` | Bundle scan: no `Â·` |

### Repository findings raised during remediation (not in the original audit)

| Finding | What it was | Phase | Evidence |
|---|---|---|---|
| RS-001 | Unauthenticated stock mutation endpoint | 006a | Route returns 410; unauthenticated probe |
| RS-002 | DDL reachable before authorisation | 006a | `requirePermission` runs before any schema work |
| RS-003 | Raw 500 detail leakage | 006a | Masked with a correlation id |
| RS-004 | Weak production session secret fallback | 006a | Fails closed in production |
| RS-005 | Caller-controlled movement attribution | 007-A | Real authenticated actor recorded |
| RS-006 | Per-instance auth throttling | 011-B3 | Concurrent burst of 8 admits exactly 5 |
| RS-007 | No CI; schema changes on request paths | 012 | CI on every push; ~100 DDL statements moved to `scripts/migrate.mjs` |

## Change made outside the audit programme

**Stock is held when an order is confirmed** (2026-07-19, `dd390d3`). Deducting only at production completion meant a shortage caused by a second order was discovered after the first had been baked. Holding is not deducting: ingredients stay on the shelf and still leave stock exactly once, at the configured deduction stage. Live probe 10/10 — order A confirmed → stock 1000, held 400; order B needing 800 with 600 free → accepted and flagged `Shortage`; cancelling returned the hold. Configurable via `stockHoldStage`.

## Defects the gates themselves caught

Listed because they show what the harness detects, not to pad the record:

- A connection leak on every page load (an unread 401 response body) — surfaced by a browser smoke hanging on `networkidle`.
- A timing oracle in password reset: the response floor padded only the cheap branch, leaving known and unknown addresses distinguishable by ~1.9 s. Now ~0.3 s.
- Bootstrap silently truncated history: **1,458 audit rows and 962 movements existed; 100 and 200 were returned.** Operators saw ~7% of the audit trail with nothing indicating truncation.
- Two test files were being deployed as live serverless functions.
- The committed lockfile cannot produce a clean install on Linux.

## Known limitations — deliberately not claimed

1. **Password reset delivery is unproven.** Resend accepts the mail (message IDs and `sent_at` for all three reset emails), but **none reached `delivered`**: two ended `delivery_delayed`, one `sent`. A locked-out operator may not receive a link. This is an operational/DNS matter between `pastrycounty.com` and `pastrycounty.ng`, not a code defect.
2. **No manual accessibility verification.** Automated axe catches roughly half of real defects. Keyboard-only and screen-reader passes have not been performed, and no screen-reader claim is made.
3. **No model-backed assistant.** No provider key is configured (verifiable at `/api/health`); the deterministic Kitchen Helper is the shipped behaviour and no AI capability is claimed.
4. **Concurrency and fault injection** were not run against a dedicated preview database. Production probes were idempotent and reversible only.
5. **`recipeItems` (108.7 kB)** is the largest remaining bootstrap item. It is not growth-capped, so it needs per-recipe loading rather than pagination.
6. **No backup/restore or rollback drill**, and no external SPF/DKIM/DMARC sign-off.
7. **Serverless cold-start and function-size figures** were not captured — they need Vercel dashboard access for the production project, which was not available.
8. **Accessibility sweep covers five routes plus login.** Modals, forms and detail pages are not yet swept.

## Notes for the auditor

- Deploys are a push to `main`. Production is the Vercel project under team `sanuske2-2147s-projects`.
- Schema changes are applied by `npm run db:migrate`, or by an Owner/Admin through the app's `schema.ensure` action (`{ check: true }` reports status without changing anything). All six migrations are applied and recorded in `schema_migrations`.
- `smoke:milestone7` occasionally fails with a 30-second click timeout at varying steps. Investigated twice and traced to environment rather than the app; a repeated failure at the **same** step should be treated as real.
- Per-phase detail, including what each phase did **not** prove, is in `.planning/phases/*/VERIFICATION.md`. Programme state is in `.planning/STATE.md`.

## Historical context

The June 22 2026 audit scored 96/100 at a narrower scope with zero findings. Phases 001–006 (pastry formula depth, ingredient workflows, imports, costing) were implemented and smoke-verified before the July 10 audit. That evidence remains useful for regression purposes but is **not** a readiness signal and is superseded by the 54/100 baseline.
