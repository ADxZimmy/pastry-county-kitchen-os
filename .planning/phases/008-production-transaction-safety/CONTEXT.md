# Context

## Goal

Make production queues truthful and stock deduction transaction-safe: correct period filters, a server-enforced production state machine, guarded batch completion, and protected order cancellation. Closes audit findings PCO-004, PCO-005, PCO-009.

## Relevant Files

- Path: src/App.tsx:2074-2077
  Why it matters: "This Week" bucket matches every order (`bucket === "This Week" ||` short-circuits the date test) and no bucket excludes Delivered/Cancelled orders.
- Path: src/App.tsx:2055,2067
  Why it matters: `canCompleteBatch` allows Ready -> Completed in one tap; Complete Batch deducts stock for multiple orders with no confirmation summary or QC step.
- Path: api/_actions.js (`production.batchStatus` and order status actions)
  Why it matters: Server accepts status jumps; the state machine must be enforced here, not by button visibility.
- Path: src/App.tsx (order detail cancel action)
  Why it matters: Cancelling lacks the destructive confirmation that delete already has, and does not explain reservation/deduction consequences.
- Path: src/lib/kitchen.ts
  Why it matters: Home for a shared, timezone-aware production eligibility function used by Production buckets, batch grouping, and dashboard due-work counts.
- Path: src/App.tsx:2140-2200 (individual production QC flow, productionQcLogs)
  Why it matters: Phase 004 already built a QC capture flow for individual completion; batch completion must reuse it.

## Decisions

- Decision: One shared eligibility function: due date within explicit period boundaries in the business timezone (Africa/Lagos default), status not Draft/Cancelled/Delivered/Archived, at least one producible item, remaining quantity > 0.
  Reason: Audit PCO-004; every surface (Today/Tomorrow/This Week, batches, dashboard) must agree.
- Decision: Server-enforced state machine Ready -> In Progress -> Quality Check -> Completed; invalid transitions rejected with 4xx even when called directly against the API.
  Reason: Audit PCO-005 explicitly warns against relying on button visibility.
- Decision: Batch completion opens a confirmation/QC modal (orders included, planned vs actual quantity, waste, ingredients to deduct with current -> resulting stock, shortages, acting user) and commits in one atomic server transaction that is idempotent.
  Reason: Grouped stock deduction is irreversible without a correction movement; accidental taps must not alter inventory.
- Decision: Cancellation shows a destructive confirmation stating whether reservations release, whether production started, whether stock was already deducted and a reversal movement will be created, and captures a reason recorded to order_events.
  Reason: Audit PCO-009.

## Risks

- Risk: Existing production smoke scripts assume the current looser transitions.
  Mitigation: Update smoke:phase4-pastry-depth / navigation smokes in the same phase and run them locally before pushing.
- Risk: Timezone handling introduces off-by-one date bugs.
  Mitigation: Pure date-boundary functions with unit tests around week start/end, midnight, and month boundaries in the configured timezone.
- Risk: Making batch completion atomic changes API response shape.
  Mitigation: Keep the action name, extend the payload; version-check in frontend before deploy.
