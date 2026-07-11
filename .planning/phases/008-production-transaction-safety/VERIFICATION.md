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

## Deployed Verification (2026-07-11)

- Deploy: pushed 008-A/B/C (`b44d624`); production build `index-DO1hokkK.js` went live, `/api/health` stayed `ok: true, sessionSecret: "configured"`. Unlike 007, 008 did not change the bootstrap snapshot query, so bootstrap was unaffected.
- Command/check: `npm.cmd run smoke:live-audit` against production
  Result: Passed; all child smokes green (incl. phase4-pastry-depth, which produces an order through the new production_runs path), rate-limit window respected, temporary records archived.
- Command/check: controlled repeat-completion + cancellation probe (temp ingredient/recipe/order, self-cleaning; script removed after use)
  Result: Passed the safety-critical checks. First `order.produce` succeeded and deducted stock once (100000g -> 99000g). A repeat `order.produce` returned `{ produced: false, alreadyProduced: true }` with NO error and NO second deduction (stock stayed 99000g) — the production_runs unique(order_id) idempotency guarantee holds against real Postgres. Cancelling the produced order was blocked with 409 (state machine). Temp records archived.
  Note: the probe's "cancel without reason -> 400" expectation was wrong, not a defect: on a Produced order the transition check (Produced->Cancelled) correctly returns 409 before the reason check is reached. The reason-required 400 path applies to still-cancellable orders and is covered by the code + unit reasoning.

- A dedicated `smoke:production-safety` (008-C step 13) remains planned once packaged as a repeatable, self-cleaning script; the checks above are the interim gate.

## Residual Risk

- Risk: The live concurrency proof (two simultaneous completions -> one deduction) is asserted by the unique constraint + `isUniqueViolation` unit test and must still be confirmed with a production repeat-call check; unit tests cannot exercise real Neon concurrency.
  Owner: Phase 008 deploy.
- Risk: Batch completion applies one QC/actual-yield default per order; explicit per-order actual yield/waste stays with individual production. Acceptable for a truthful default (waste 0 unless individually QC'd).
  Owner: acceptable; revisit if operators need per-order batch QC.
