# Verification

## Automated Checks

- Command: `npm.cmd test`
  Result: Passed; 114/114 tests across 6 files (was 101 after 006a).
  Notes: New coverage — order-event isolation/chronology/actor/empty-legacy state and `actorLabel` precedence (007-A); canonical pricing 7,500/18,000/40,000, multi-line, zero/missing price, discount cap, tax+delivery, partial payment, anti-tamper (client totals ignored), negative/non-finite rejection, and a preview-vs-authoritative drift guard (007-B); recommendedRestockDate math and grounded restock provenance (007-C).
- Command: `npm.cmd run build`
  Result: Passed; tsc + Vite build clean (JS ~339.7 kB / 95.4 kB gzip).
- Command: runtime-source scans
  Result: No hard-coded `18000` outside test fixtures; no fabricated timeline strings ("May 18, 2026", "Stock shortage detected"); no mojibake (`Â·` etc.) across src/api/db/server/index.html; `git diff --check` clean.
- Command: `node --check` on api/_actions.js, api/_db.js
  Result: Passed (DB code paths are not exercised by unit tests; validated by syntax check + the production smoke).
- Command: `npm.cmd run smoke:orders-pricing`
  Result: Not yet implemented; the consolidated orders/pricing/timeline smoke is planned in 007-C step 15. The existing `smoke:live-audit` (order create/reserve/produce) already exercises the new event writes and pricing persist paths.

## Deployed Verification (2026-07-11)

- Deploy: pushed the Phase 007 commits + merge; production auto-deployed on team `sanuske2-2147s-projects`. The new client bundle `index-C20283Ss.js` went live and `/api/health` stayed `ok: true, sessionSecret: "configured"`.
- Incident + hotfix (`a75c688`): the first Phase 007 build 500'd `/api/bootstrap` for every authenticated user (a functional outage — the app could not load after login). Root cause: the new `order_events` snapshot query joins `orders` to filter archived orders, and both tables have a `created_at` column, so the unqualified `created_at as "createdAt"` raised a Postgres ambiguous-column error, masked to a generic 500 by the RS-003 handler. `schema.ensure`/`ensureOperationalTables` still succeeded (no SELECT), which is how the migration looked healthy while bootstrap failed. Fixed by fully qualifying every column in the query with the `order_events` prefix. This class of bug (a join introducing an ambiguous column) is invisible to the unit suite (no database) and was caught only by the integration smoke.
- Post-fix probe: `/api/bootstrap` returned 200 with `orderEvents` present, orders loaded, and the pricing fields (`netTotal`, ...) present on orders.
- Command/check: `npm.cmd run smoke:live-audit` against production
  Result: Passed. phase2-rerun, milestone7, regression-audit, phase3-pastry, phase4-pastry-depth, navigation-routing, and import-onboarding all green; the runner waited out the five-login/60-second window; temporary records archived. This exercises order create/reserve/produce, so the new event-write and pricing-persist paths ran end to end without error.

## Manual Checks

- Check: two-order timeline isolation and varied-price comparison after refresh
  Result: Pending production deploy. Unit tests prove isolation/actor/pricing at the pure-function boundary; the authenticated create/edit/refresh cross-module check runs post-deploy (and is the D1 gate content in 015-A).

## Implementation Notes

- 007-A: `order_events` table (canonical schema, snapshot loader, idempotent ensureOperationalTables migration) + one-time truthful `created` backfill per legacy order; events written in the same transaction as every order mutation with the authenticated actor; `audit()` and order-triggered movements now record the real actor; timeline renders only the selected order's events with an honest empty state; shortage stays a live calculation.
- 007-B: nullable pricing columns on orders/order_items; one authoritative `computeOrderPricing` contract (validates, recomputes, ignores client totals, rounds once) persisted by `order.save`; a matching frontend preview mirror; Order Detail shows persisted net/gross/margin/balance or "No selling price set"; costing is a blank non-persisted what-if; every hard-coded 18,000 removed.
- 007-C: data-derived restock guidance (stock, reorder level, shortfall, consuming orders, supplier lead time, recommended order-by date) replacing the static "Restock before Friday"; mojibake fixed.

## Residual Risk

- Risk: DB-level behavior (transactional rollback on event-write failure, migration/backfill on the live schema, cross-page total equality) is only verified by syntax + unit contracts locally.
  Owner: Phase 007 deploy — run `smoke:live-audit` and the create/edit/refresh checks against production before treating PCO-001/002/014/016 as closed at the D1 gate.
- Risk: sale quantity currently defaults to produced quantity (yield x multiplier) rather than an independent input.
  Owner: acceptable for truthful revenue now; a separate sale-quantity field is a small follow-up if operators need to sell a different count than they produce.
