# Plan

## Outcome

Production pages show only genuinely eligible work for the selected Africa/Lagos period. The API rejects invalid lifecycle jumps. Batch/order completion is explicitly reviewed, quality-checked, locked, atomic, and uniqueness-backed against duplicate deduction. Cancellation is confirmed and never performs a hidden stock reversal. PCO-004, PCO-005, and PCO-009 close at the Demo Trust Gate.

## Scope

Included:

- Shared business-timezone period boundaries and eligibility rules.
- Server-enforced production lifecycle and role checks.
- `production_runs` or equivalent completion record with database idempotency key.
- Atomic stock/FEFO/QC/event/audit completion with concurrency protection.
- Batch confirmation/QC UI with actual yield and waste capture.
- Consequence-aware cancellation and explicit post-deduction correction policy.

Excluded:

- Partial fulfilment and analytics dashboards beyond storing actual yield/waste/variance for the completed run.
- Configurable deduction-stage execution (Phase 009 consumes the safe transaction built here; Phase 008 preserves completion as the default).

## Delivery Slices

### 008-A Queue Truth And Lifecycle

1. Add a business-timezone setting/config with `Africa/Lagos` default and pure `productionPeriodBounds`/`eligibleForProduction` functions. Define week start explicitly and test midnight, DST-independent Lagos behavior, month/year edges, past/future dates, terminal statuses, archived orders, missing items, and completed work.
2. Replace every Dashboard/Production/batch inline filter with the shared eligibility function so Today, Tomorrow, and This Week agree.
3. Define canonical persisted states and allowed transitions, including how derived Ready relates to `Not Started`; reject Ready/Not Started -> Completed and all terminal-state escapes in backend action tests.
4. Migrate frontend actions and existing smokes to the state machine, then deploy and run a focused queue/transition smoke.

### 008-B Locked Atomic Completion

5. Add `production_runs`/completion metadata with a unique idempotency key tied to the intended batch/order completion request. Record included orders, planned/actual yield, waste, actor, QC, and timestamps.
6. Implement completion with row locks or serializable semantics over the run, orders, ingredients, and FEFO batches. In one commit: validate transition/shortages, claim idempotency key, write run/QC, deduct lots and aggregate stock, release reservations, write movements, write order events/audit, and update statuses. Any failure rolls back all writes.
7. Add a concurrent-request test (two simultaneous completions with the same and different keys) proving exactly one deduction; do not accept an in-memory lock or status preflight as sufficient.
8. Build the batch review/QC modal: included orders, planned/actual quantity, waste, per-ingredient current -> deduction -> resulting stock, substitutions/shortages, and authenticated actor; the confirm button sends the idempotency key.
9. Deploy and run a controlled completion smoke with before/after database counts and repeat-call verification.

### 008-C Safe Cancellation

10. Add a reason-required cancellation preview endpoint/helper returning reservation, production, and deduction consequences.
11. For orders without deduction, cancel and release reservations with event/audit writes in one transaction. For produced/delivered/deducted orders, reject normal cancellation and direct the operator to an explicit privileged correction/reversal flow; never reconstruct consumed FEFO lots silently.
12. Add tests and smoke coverage for Draft/Confirmed/Reserved/In Progress/Produced/Delivered cancellation behavior and actor/reason attribution.
13. Add `smoke:production-safety` to the umbrella smoke only after it is repeatable and self-cleans.

## Verification

- Check: `npm.cmd test` and `npm.cmd run build`
  Expected: eligibility, lifecycle, transaction, concurrency, cancellation, and existing regression checks pass.
- Check: direct API Ready/Not Started -> Completed request
  Expected: 409/422 with no order, QC, event, movement, lot, or stock change.
- Check: two concurrent completion requests
  Expected: exactly one committed production run and one set of stock deductions; retry returns the original result or an explicit idempotent no-op.
- Check: forced failure after movement preparation
  Expected: transaction rolls back orders, lots, aggregate stock, movements, QC, and events together.
- Check: `npm.cmd run smoke:production-safety` and `npm.cmd run smoke:live-audit`
  Expected: pass against production with cleanup complete.

## Rollback

Deploy slices separately. New completion tables/columns are additive. Retain database uniqueness constraints during application rollback so an older UI cannot reintroduce duplicate deduction; temporarily disable completion if a safe compatible server path is unavailable.
