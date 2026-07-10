# Context

## Goal

Reject invalid recipe yields everywhere, make every saved setting actually govern behavior through one central policy service, and distinguish divisible from indivisible units. Closes audit findings PCO-006, PCO-007, PCO-008.

## Relevant Files

- Path: src/lib/kitchen.ts:125-128
  Why it matters: `scaleRecipe` divides by `recipe.baseYieldQuantity` with no guard; zero base yield produces Infinity, negative target yields produce negative requirements.
- Path: src/lib/kitchen.ts:110-119
  Why it matters: `roundScaledQuantity` rounds grams to one decimal (`toFixed(1)`) and never consults `settings.gramRoundingPreference`; `roundByPreference` (kitchen.ts:75-80) does consult it but is not used by the scaling path.
- Path: src/data.ts:37-41, src/types.ts:399-403
  Why it matters: Settings define `defaultDeductionStage`, `allowNegativeInventory`, `gramRoundingPreference`, `eggRoundingPreference`; deduction stage has no consumer anywhere in the codebase.
- Path: src/App.tsx:2160-2161, 1946
  Why it matters: Yield inputs use `min="0"` or none; zero/negative values reach scaling.
- Path: src/App.tsx:1568 (ingredient form)
  Why it matters: Count units (pcs, pack, roll, box) accept decimal current stock (step 0.001) with no divisibility concept.
- Path: api/_actions.js
  Why it matters: Server must mirror all validation and consume deduction-stage policy for order lifecycle deductions.

## Decisions

- Decision: Create `src/lib/policy.ts` as the single policy service: quantity rounding (gram + count), negative inventory, reservation behavior, deduction stage, AI confirmation requirement, currency formatting. Server actions receive the same policy decisions via shared validation logic.
  Reason: Audit PCO-007 - "a setting that does nothing is worse than no setting"; duplicated per-module logic caused the drift.
- Decision: Validate on client and server: baseYield > 0, targetYield > 0, ingredient quantities finite and > 0, scale factor and scaled quantities finite. Field-level errors, never silent correction.
  Reason: Audit PCO-006 explicit requirements.
- Decision: Add unit metadata `allowsDecimals` and `minimumIncrement`; pcs/pack/box/roll default to whole numbers unless the ingredient explicitly permits partials.
  Reason: Audit PCO-008; stock entry, scaling, and shopping must share one rule.
- Decision: Wire `defaultDeductionStage` into the order lifecycle server-side (deduct at confirmation / production start / completion per the setting), building on the Phase 008 transaction.
  Reason: The setting currently exists purely as stored data.

## Risks

- Risk: Applying gram rounding to scaling changes displayed quantities that existing tests/smokes assert.
  Mitigation: Update expected values in the same change; show mathematical vs practical value separately where rounding distorts small batches (audit section G note).
- Risk: Deduction-stage wiring changes when stock moves for existing workflows.
  Mitigation: Default remains production_completion (current de facto behavior); other stages activate only when the operator changes the setting.
- Risk: Whole-number enforcement could block existing decimal stock records.
  Mitigation: Enforce on new input only; flag existing fractional counts in UI rather than mutating data.
