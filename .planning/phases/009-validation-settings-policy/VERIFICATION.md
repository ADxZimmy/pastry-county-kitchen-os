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

## Residual Risk

- Risk: `defaultDeductionStage` and `allowNegativeInventory` still need enforcement; deferred to a focused pass because moving deduction timing is stock-integrity critical (owner decision 2026-07-11 to deploy the safe 009-A + gram-rounding increment and pause before it).
  Owner: Phase 009-B continuation.
- Risk: legacy fractional count stock conflicts with the future unit policy (009-C).
  Owner: Phase 009-C; flag for operator correction without silent rewrite.
