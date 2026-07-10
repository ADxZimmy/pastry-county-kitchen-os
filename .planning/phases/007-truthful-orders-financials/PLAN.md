# Plan

## Outcome

No fabricated data anywhere in the product: order timelines show only real events for the selected order, all profit/margin figures use the order's persisted selling price, dashboard guidance is data-derived or removed, and no encoding artifacts remain. Audit findings PCO-001, PCO-002, PCO-014, PCO-016 closed.

## Scope

Included:

- `order_events` persistence, transactional event writes in server actions, and a real order-detail timeline.
- Order/order-item pricing fields end to end (schema, API, types, forms, costing, dashboard, reports, assistant response).
- Removal of every hard-coded 18000 and the static timeline block.
- Data-derived dashboard suggestions (or removal of the static suggestion card).
- Mojibake cleanup and a repo-wide encoding scan.

Excluded:

- Production state machine and batch confirmation (Phase 008).
- Settings/policy centralisation (Phase 009).
- Assistant re-architecture (Phase 014); only its hard-coded price input is fixed here.

## Steps

1. Add `order_events` table (id, order_id, event_type, actor_user_id, previous_status, new_status, metadata, note, created_at) to server/setup-db.js and a migration path for the live Neon DB; backfill one "created" event per existing order.
2. Write events transactionally inside every order-mutating action in api/_actions.js (create, edit, confirm, reserve, production start, produced/deduct, deliver, cancel, restore) including the acting user.
3. Expose events in the bootstrap/order payloads; replace the static timeline at src/App.tsx:2007 with events for the active order only, and derive any shortage entry from the current stock-requirement calculation.
4. Add pricing columns to orders and order_items (unit_selling_price, discount, delivery_fee, tax, gross_total, net_total, amount_paid, balance); update api actions to validate and persist them.
5. Update src/types.ts, order create/edit forms, and order detail to capture and display pricing; show explicit "No selling price set" states for legacy orders.
6. Replace `sampleSellingPrice`/`useState(18000)`/kitchen.ts:453 fixed values so all margin paths consume the persisted net order total (costing page may keep a user-editable what-if input that defaults to the recipe's real context, never a silent constant).
7. Rebuild the dashboard suggestion card to compute restock guidance from reorder levels, due orders, and stock (state the why: quantity, orders affected, current stock, recommended purchase date) or drop the card if data is insufficient.
8. Replace `Â·` with `·` at src/App.tsx:1240 and grep the repo for `Â`, `â€`, and similar artifacts; verify files are clean UTF-8.
9. Add regression tests: two different orders never share timeline events; margin uses each order's own net total (7,500 / 18,000 / 40,000 cases); zero-price, discount, tax, and multi-item totals; suggestion provenance.
10. Extend or add a production smoke (`smoke:orders-pricing`) covering create-with-price, timeline events after confirm/produce, and margin display, then wire it into smoke:live-audit.

## Verification

- Check: `npm.cmd test`
  Expected: All existing tests plus new pricing/timeline regression tests pass.
- Check: `npm.cmd run build`
  Expected: TypeScript + Vite build passes.
- Check: grep for `18000` in src/ (excluding tests that assert its absence) and for the static timeline strings
  Expected: No hard-coded selling price or fabricated timeline strings remain.
- Check: grep for `Â` in src/
  Expected: No mojibake.
- Check: New smoke against production after deploy
  Expected: Order created with real price shows correct margin and a timeline containing only its own events.

## Rollback

All schema changes are additive (new table, new nullable columns); revert the app commit and the UI falls back cleanly. Keep the migration idempotent so re-runs are safe.
