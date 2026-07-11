# Plan

## Outcome

Order timelines show only persistent events for the selected order with real timestamps and actors. Every sales, payment, profit, and margin value is derived from validated persisted pricing by one server-canonical calculation. Dashboard guidance is data-derived or removed, and production text contains no encoding artefacts. PCO-001, PCO-002, PCO-014, PCO-016, and RS-005 close at the Demo Trust Gate.

## Scope

Included:

- Persistent `order_events`, transactional event writes, real timeline, and actor-aware audit records.
- Distinct production quantities versus sale quantities/prices.
- Server-calculated line totals and order subtotal/discount/delivery/tax/net/paid/balance fields.
- Removal of every hard-coded 18,000 financial assumption from app, reports, dashboard, and helper responses.
- Data-derived dashboard suggestions with explicit provenance, or removal when data is insufficient.
- Mojibake cleanup and UTF-8 verification.

Excluded:

- Production state machine and batch completion (Phase 008).
- Settings/policy centralisation (Phase 009).
- Model-backed assistant (Phase 014); this phase only makes its financial inputs truthful.

## Delivery Slices

### 007-A Order Event Truth

1. Add an explicit idempotent migration for `order_events` with order id, event type, actor user id, actor display snapshot, previous/new status, metadata, note, and timestamp; update canonical schema and snapshot types.
2. Backfill at most one truthful `created` event per legacy order from its real `created_at`; do not synthesize confirmation, shortage, production, or delivery history.
3. Refactor order-mutating actions so the business write, event, and audit entry commit in the same transaction. Pass the authenticated actor into audit/event helpers; reserve `system` for named automated maintenance jobs.
4. Replace the static Order Detail timeline. Display current shortage as a separately labelled live calculation, not a historical event.
5. Add tests proving isolation between two orders, actor attribution, rollback on event-write failure, and an honest empty/legacy state.
6. Deploy and run a focused timeline smoke before starting 007-B.

### 007-B Canonical Pricing And Margins

7. Add line-level fields (`sale_quantity`, `unit_selling_price`, `line_discount_amount`, `line_subtotal`, `line_total`) and order-level fields (`subtotal`, `order_discount_amount`, `delivery_fee`, `tax_rate`, `tax_amount`, `gross_total`, `net_total`, `amount_paid`, `balance`). Use suitable decimal database types and nullable legacy values.
8. Implement one pure pricing contract shared by API tests and frontend display types, but make the API authoritative: validate finite/non-negative inputs, recompute derived totals, reject tampered client totals, and define rounding once.
9. Update order create/edit/detail, costing, reports, dashboard, and helper responses. Legacy orders show `No selling price set`; they never inherit a default price.
10. Remove hard-coded `18000` from runtime source. A costing what-if field may accept explicit user input but must start blank or from selected persisted context and be labelled non-persisted.
11. Add regression cases for 7,500/18,000/40,000 orders, multiple lines, zero/missing price, discounts, delivery, tax, partial payment, changed ingredient cost, and cross-page total equality.
12. Deploy and run a create/edit/refresh pricing smoke before starting 007-C.

### 007-C Guidance And Encoding

13. Replace static restock copy with a calculation that exposes current stock, demand/orders, required quantity, supplier lead time, business date/timezone, and recommended purchase date; remove the card when these inputs are unavailable.
14. Remove `Â·` and scan tracked text for common UTF-8 mojibake patterns without changing binary fixtures or third-party files.
15. Extend `smoke:orders-pricing` to cover timeline, actor, pricing, dashboard provenance, refresh, and UTF-8 production strings; add it to `smoke:live-audit` only after it is stable and self-cleans.

## Verification

- Check: `npm.cmd test`
  Expected: event isolation/transaction tests and canonical pricing regression cases pass with all existing tests.
- Check: `npm.cmd run build`
  Expected: TypeScript and Vite build pass.
- Check: runtime-source scan for `18000`, static timeline strings, `Restock before Friday`, and mojibake
  Expected: no invented runtime value/text remains; legitimate numeric test fixtures are allowed only when asserting varied inputs.
- Check: direct API submission with forged derived totals
  Expected: API ignores/recomputes or rejects the forged values; persisted totals match the canonical server result.
- Check: `npm.cmd run smoke:orders-pricing` against production
  Expected: create/edit/refresh events and prices remain isolated and correct; temporary records are cleaned up.

## Rollback

Each slice is independently deployable and additive. UI rollback can ignore new nullable columns/events. Never roll back by restoring fabricated timeline entries, a default selling price, or `system` attribution for human actions.
