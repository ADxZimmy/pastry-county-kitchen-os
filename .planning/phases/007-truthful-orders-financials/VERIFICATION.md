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
  Result: Not yet implemented; the consolidated orders/pricing/timeline smoke is planned in 007-C step 15 and will run against production after deploy. The existing `smoke:live-audit` (order create/reserve/produce) already exercises the new event writes and pricing persist paths.

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
