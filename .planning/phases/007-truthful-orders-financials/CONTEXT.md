# Context

## Goal

Remove every fabricated or hard-coded operational and financial value so order history, pricing, margins, and dashboard guidance are derived only from real data. Closes audit findings PCO-001, PCO-002, PCO-014, PCO-016.

## Relevant Files

- Path: src/App.tsx:2007
  Why it matters: Order detail renders a static timeline ("Order confirmed / May 18, 2026 / Stock shortage detected / Dark Chocolate and Eggs need restock") for every order.
- Path: src/App.tsx:1907
  Why it matters: `sampleSellingPrice = 18000` feeds order cost/margin previews.
- Path: src/App.tsx:2569
  Why it matters: Costing page seeds `useState(18000)` as the selling price.
- Path: src/lib/kitchen.ts:453-454
  Why it matters: Assistant cost response computes margin against a fixed 18000 and says so in the reply text.
- Path: src/App.tsx:1292
  Why it matters: Dashboard "Restock before Friday" suggestion is static copy, not derived from stock/orders/lead time.
- Path: src/App.tsx:1240
  Why it matters: Mojibake `Â·` shipped in source (UTF-8 double-encoding artifact).
- Path: api/_actions.js, api/bootstrap.js, server/setup-db.js, db/
  Why it matters: Server actions, snapshot payload, and schema must add order pricing fields and order events.
- Path: src/types.ts, src/data.ts
  Why it matters: Order/OrderItem types and defaults must carry pricing fields; audit log types feed the timeline.

## Decisions

- Decision: Derive the order timeline from a persistent `order_events` record written transactionally by existing server actions (create, confirm, reserve, start, produce, deliver, cancel, restore, edit), with actor and timestamps.
  Reason: Audit PCO-001 requires real per-order history; the existing audit-log infrastructure is the natural backbone, extended with typed order events.
- Decision: Add real pricing to orders and order items: unit selling price, quantity, discount, delivery fee, tax, gross total, net total, amount paid, balance. All margin math consumes the persisted net total.
  Reason: Audit PCO-002; a correct formula with an invented input is still a false answer.
- Decision: Dashboard suggestions must state why they were generated (quantity, orders, stock, lead time, recommended date) or be removed for launch.
  Reason: Audit PCO-014; decorative guidance erodes operator trust.
- Decision: Fix encoding artifacts in source and scan the repo for other mojibake; keep files UTF-8 without BOM.
  Reason: Audit PCO-016.

## Risks

- Risk: Existing production orders have no pricing data.
  Mitigation: Migration backfills pricing fields as null/0 with UI showing "No selling price set" instead of inventing values; margin shows only when a price exists.
- Risk: App.tsx is a 3,201-line monolith; timeline and pricing edits touch many sections.
  Mitigation: Keep edits scoped per section; rely on the existing test suite plus new regression tests before deploy.
- Risk: Historical orders predate order_events and would show empty timelines.
  Mitigation: Synthesize a single "Order created" event from created-at data during migration; never fabricate richer history.
