# Verification

## Automated Checks

- Command: `npm.cmd test`
  Result: Passed; 137/137 tests across 6 files (131 after 008, +6 across 009 so far).
  Notes: shared policy validation/rounding (incl. 187.5g at 1/5/10g), scaleRecipe rejecting 0/negative/NaN/Infinity yields, and gram-rounding practical-quantity application.
- Command: `npm.cmd run build`
  Result: Passed; both tsc and Vite resolve the cross-directory `shared/policy.js` (via `shared/policy.d.ts`).
- Command: `node --check` on `shared/policy.js`, `api/_actions.js`
  Result: Passed; Node imports the shared module directly (verified with `node -e`).
- Command: `npm.cmd run smoke:policy-settings`
  Result: Not implemented yet; planned in 009-C once the settings contract lands.

## Status (2026-07-11)

- 009-A DONE and DEPLOYED (`6d33a07`): shared/policy.js + .d.ts (one policy source for both runtimes); scaleRecipe rejects invalid yields; server recipe.save validates base yield + item quantities; scaling UI guards the throw.
- 009-B PARTIAL and DEPLOYED (`7b91198`): gramRoundingPreference now produces a practical quantity (half of PCO-007). Remaining 009-B: wire `defaultDeductionStage` into the Phase 008 completion transaction (stock-integrity critical) and negative-inventory semantics; enforce/rename/remove the rest of the settings.
- 009-C Unit Divisibility: not started.

## Deployed Verification (2026-07-11)

- Deploy: pushed through `7b91198`; production build `index-Bn9E-3M0.js` live, `/api/health` green.
- Command/check: shared-module + validation probe (temporary, removed)
  Result: `schema.ensure` returned 200 (proves `api/_actions.js` and its `../shared/policy.js` import were traced into the Vercel serverless bundle — the key risk for a cross-directory shared module); `recipe.save` with base yield 0 returned 400 "Base yield must be greater than zero." (shared validation runs server-side, not a 500). No record created.
- Command/check: `npm.cmd run smoke:live-audit`
  Result: Passed; all child smokes green, including phase3/phase4 (recipe.save exercises the shared import) and navigation-routing (the scaleRecipe-throws change did not crash any scaling view). Temporary records archived.

## Deduction-stage wiring (deployed 2026-07-11, commit `18d2c69`)

- Extracted `deductOrderStock` as the single deduction path; it claims the `production_runs` unique(order_id) row as the first statement so any stage deducts at most once. produceOrder checks for a prior run before deducting so an early-stage deduction is not re-shortage-checked against depleted stock. Early deduction triggers at the configured stage (confirmation on reserve/order.save; production_start when the order moves In Production) and defers on shortage. Default `production_completion` path is behaviour-preserved and the wiring is inert for it.
- Command/check: stage-toggling production probe (temp ingredient/recipe/order, settings saved+restored, self-cleaning; script removed)
  Result: 17/17 passed against real Postgres. For each of production_completion / production_start / confirmation, stock deducted EXACTLY ONCE at the configured stage (100000 -> 99000, never 98000), completion after an early deduction returned `deductedEarlier` without a second deduction, and a repeat produce was idempotent (`alreadyProduced`, stock unchanged). Original setting restored.
- Command/check: `npm.cmd run smoke:live-audit`
  Result: Passed with production's current `production_start` setting active; all child smokes green, temporary records archived.

## Action needed — production setting

- Production's `defaultDeductionStage` was found to be `production_start` (it had no effect before this deploy because the setting was unwired — the exact PCO-007 bug). Now that 009-B honours it, live orders deduct stock when production STARTS, not at completion. This is the fix working, but it is a real behaviour change: if production starts and is then cancelled, stock is already gone and needs an explicit correction. The owner should confirm `production_start` is intended, or set it to `production_completion` (the conservative default matching all prior behaviour). Flagged 2026-07-11; not changed unilaterally.

## Negative inventory + settings inventory (deployed 2026-07-11, commits `09890d5`, `e8a733f`)

- `allowNegativeInventory` is now enforced end to end. Disabled (default) blocks a short production at every gate (order.status In Production, production.batchStatus, and the completion deduction). Enabled lets a short order flow start -> produce as a backorder: aggregate `current_stock` goes negative, FEFO lots stop at zero (`greatest(0, ...)`), and the order is flagged Shortage/Produced. The `ingredients current_stock >= 0` CHECK was dropped (schema + idempotent migration) to permit the deficit; app-level shortage/adjustment guards keep stock >= 0 otherwise. Frontend production buttons and the batch confirm modal respect the setting.
- Settings inventory: removed the non-functional "Require confirmation before AI conversions" toggle from the UI (it did nothing and implied a bypass); the server now always stores `require_ai_conversion_confirmation = true` (mandatory-review invariant, Phase 010 owns the flow). settings.save normalizes the deduction stage. Confirmed the other controls are already effective in code.
- Command/check: backorder probe (temp ingredient stock 500, requirement 1000; settings saved+restored; self-cleaning; script removed)
  Result: 8/8 passed against real Postgres. Disabled: short produce blocked 409, stock unchanged 500, order not produced. Enabled: short produce succeeds, aggregate stock -> -500, order Produced + Shortage. requireAiConversionConfirmation stayed true after a settings save. Original setting restored.
- Command/check: `npm.cmd run smoke:live-audit`
  Result: Passed with the default (disabled) setting; all child smokes green, temporary records archived.

## Residual Risk

- Risk: negative aggregate stock is now possible for opt-in backorders; the DB CHECK no longer backstops it. Mitigation: disabled by default, gated at every production entry point, manual `inventory.adjust` keeps its own non-negative guard, and FEFO lots never go below zero.
  Owner: acceptable per plan (explicit deficit); revisit if a correction/reversal flow for backorders is needed.
- Remaining in Phase 009: 009-C Unit Divisibility (per-ingredient allows_decimals / minimum_increment).
- Risk: legacy fractional count stock conflicts with the future unit policy (009-C).
  Owner: Phase 009-C; flag for operator correction without silent rewrite.
