# Verification

## Automated Checks

- Command: `npm.cmd test`
  Result: Passed; 131/131 tests across 6 files (114 after 007, +17 across Phase 008).
  Notes: production period bounds (incl. month/year edges) + bucket eligibility/isolation (008-A); order state machine transition table (008-A); isUniqueViolation detection (008-B); cancellation consequences per status + reservation-release math (008-C).
- Command: `npm.cmd run build`
  Result: Passed; tsc + Vite build clean (JS ~343 kB / 96 kB gzip).
- Command: `node --check api/_actions.js`, `git diff --check`
  Result: Passed.

## Implementation Notes

- 008-A `376509b`: Africa/Lagos production eligibility (`productionPeriodBounds`, `businessToday`, `ordersForProductionBucket`) replacing the `bucket === "This Week" ||` short-circuit; Today/Tomorrow/This Week now use explicit date ranges and show only producible orders (never Draft/Produced/Delivered/Cancelled), non-overlapping. Server-enforced `isValidOrderTransition` in the `order.status` action rejects invalid jumps (Draft/Confirmed->Produced, backwards, terminal escapes, Produced->Cancelled) with 409; terminal-status guard on batch updates.
- 008-B `b17c05f`: `production_runs` table with `unique(order_id)`. `produceOrder` inserts the run as the first statement of the deduction transaction, so a concurrent or repeat completion fails with 23505 and rolls back the whole transaction (idempotent `{ alreadyProduced }`, no double deduction) — a DB-level guarantee beyond the read-before-write preflight. Batch "Complete Batch" routes through a confirmation modal with a per-ingredient current->deducts->resulting-stock preview and the acting user; only an explicit confirm deducts.
- 008-C `6b44f0b`: `cancellationConsequences` helper; `order.status` Cancelled requires a reason (400 without) recorded on the event + audit; a consequence-aware cancellation modal replaces the one-tap button; cancel is blocked after deduction (Produced/Delivered) with guidance toward an explicit correction.

## Pending (production)

- Deploy 008-A/B/C together and run `smoke:live-audit`, plus a repeat-completion probe (produce the same order twice -> expect `alreadyProduced`, no second deduction) and a cancellation probe (reason required; blocked after produced). This is the DB-level gate: the migration (`production_runs`), the idempotency guarantee, the corrected filters, and the state machine are only proven against real Postgres by an integration smoke — the Phase 007 bootstrap outage (an ambiguous-column bug invisible to the DB-less unit suite) is why.
- A dedicated `smoke:production-safety` (008-C step 13) is planned once repeatable and self-cleaning; until then the checks ride on `smoke:live-audit` + targeted probes.

## Residual Risk

- Risk: The live concurrency proof (two simultaneous completions -> one deduction) is asserted by the unique constraint + `isUniqueViolation` unit test and must still be confirmed with a production repeat-call check; unit tests cannot exercise real Neon concurrency.
  Owner: Phase 008 deploy.
- Risk: Batch completion applies one QC/actual-yield default per order; explicit per-order actual yield/waste stays with individual production. Acceptable for a truthful default (waste 0 unless individually QC'd).
  Owner: acceptable; revisit if operators need per-order batch QC.
