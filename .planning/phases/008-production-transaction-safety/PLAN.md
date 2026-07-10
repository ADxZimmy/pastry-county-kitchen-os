# Plan

## Outcome

Production pages show only orders that genuinely belong to the selected period, terminal-status orders never appear in work queues, batches cannot skip states or deduct stock without an explicit confirmation + QC step, repeated completion never double-deducts, and cancellation explains its consequences. Audit findings PCO-004, PCO-005, PCO-009 closed.

## Scope

Included:

- Shared timezone-aware production eligibility + period boundary functions with tests.
- Correct Today / Tomorrow / This Week filtering and terminal-status exclusion everywhere production work is listed.
- Server-side production state machine and atomic, idempotent batch completion transaction.
- Batch confirmation/QC modal reusing the Phase 004 QC capture.
- Destructive cancellation confirmation with consequence summary, reason capture, and order_events record.

Excluded:

- Partial production / waste analytics beyond the confirmation fields (post-MVP roadmap).
- Deduction-stage setting wiring (Phase 009 policy service, though the transaction code lands here ready to consume it).

## Steps

1. Add `productionPeriodBounds(period, now, timezone)` and `eligibleForProduction(order, period, bounds)` to src/lib/kitchen.ts; unit-test week boundaries, terminal statuses, fully-produced orders, and timezone edges.
2. Replace the inline filter at src/App.tsx:2077 and the batch grouping source so all production buckets and grouped batches use the shared functions; exclude Draft, Cancelled, Delivered, Archived, and fully produced orders.
3. Implement the state machine in api/_actions.js for `production.batchStatus` and individual production actions: validate current -> next transitions (Ready -> In Progress -> Quality Check -> Completed), reject invalid jumps with a clear error, and enforce role checks.
4. Make batch completion a single server transaction: update orders, deduct stock via FEFO lots, write inventory movements, write QC log, write order_events and audit entries; roll back on any failure; make it idempotent (re-completion returns success without deducting again).
5. Build the batch completion confirmation modal: orders included, planned vs actual quantity, waste quantity, per-ingredient deduction with current -> resulting stock, shortages, and the acting user; require explicit confirm before the API call; remove the direct Ready -> Complete path at src/App.tsx:2067.
6. Add the cancellation confirmation dialog on order detail: reservation release, production-started warning, deduction/reversal status, required reason; server action records the reason and creates a reversal movement when stock was already deducted.
7. Update affected smokes (phase4, navigation) for the new transition rules and add `smoke:production-safety` covering: This Week boundaries, cancelled/delivered exclusion, blocked Ready -> Complete jump via direct API call, idempotent completion, and cancellation reversal.
8. Run the full local test suite and production smokes after deploy.

## Verification

- Check: `npm.cmd test`
  Expected: New eligibility/state-machine/idempotency tests pass; no regressions.
- Check: Direct API call attempting Ready -> Completed
  Expected: 4xx rejection with explanatory message.
- Check: Complete the same batch twice
  Expected: Stock deducted exactly once; second call is a no-op success.
- Check: `npm.cmd run smoke:production-safety` against production
  Expected: Pass, including week-boundary and terminal-status assertions.
- Check: `npm.cmd run smoke:live-audit`
  Expected: Umbrella smoke passes with updated production flows.

## Rollback

State machine and transaction changes are server-side; revert the commit to restore prior behavior. No destructive schema changes; order_events writes are additive.
