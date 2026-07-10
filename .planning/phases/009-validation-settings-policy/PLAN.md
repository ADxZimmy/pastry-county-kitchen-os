# Plan

## Outcome

Invalid yields are rejected with field-level errors on client and server, scaling can never emit NaN/Infinity/negative values, every settings option demonstrably changes behavior (proven by contract tests), and count units enforce whole numbers unless explicitly divisible. Audit findings PCO-006, PCO-007, PCO-008 closed.

## Scope

Included:

- Client + server yield/quantity validation and scaling guards.
- `src/lib/policy.ts` central policy service consumed by scaling, costing, inventory, shopping, production, and conversions.
- Gram-rounding preference wired into `roundScaledQuantity`; mathematical vs practical display where rounding changes results.
- Deduction-stage setting wired into the order lifecycle (server-side, on the Phase 008 transaction).
- Negative-inventory policy enforced in one place.
- Unit divisibility metadata (`allowsDecimals`, `minimumIncrement`) enforced in ingredient form, scaling, shopping, and server validation.
- Contract tests: change each setting, prove the corresponding workflow changes after save and reload.

Excluded:

- AI confirmation policy consumer (Phase 014 consumes the policy service built here).
- New settings beyond those already stored.

## Steps

1. Add validation helpers (shared client/server): `baseYield > 0`, `targetYield > 0`, `quantity > 0`, `Number.isFinite` on factor and outputs; return field-level errors.
2. Guard `scaleRecipe` (kitchen.ts:125) to throw a typed validation error on non-positive/non-finite inputs; update scaling UI (App.tsx scale page, order builder yield inputs) to `min` attributes plus explicit error display; server actions reject invalid recipe saves (zero base yield) and scale requests.
3. Create `src/lib/policy.ts` exposing roundQuantity(value, unit), allowNegativeInventory(), deductionStage(), reservationPolicy(), requiresAiConfirmation(), formatCurrency(); refactor `roundScaledQuantity`, `roundByPreference`, costing, and stock checks to consume it; delete duplicated per-module rounding.
4. Apply `gramRoundingPreference` (1/5/10g) in the scaling path; where count rounding (eggs >= 1) distorts small batches, populate `displayQuantity` with the mathematical value and show both.
5. Wire `defaultDeductionStage` server-side: the order lifecycle deducts stock at the configured stage using the Phase 008 atomic transaction; movements record which stage triggered them; keep idempotency.
6. Enforce `allowNegativeInventory` in every deduction path through the policy service (currently only checked in kitchen.ts:664).
7. Add unit metadata: `allowsDecimals`/`minimumIncrement` per unit with per-ingredient override; pcs/pack/box/roll default to whole; enforce in ingredient form inputs, server validation, scaling round-up, and shopping quantities.
8. Contract tests per setting: gram rounding 10g turns 187.5g into 190g after save+reload; deduction stage moves the movement timestamp to the configured lifecycle step; negative inventory toggle changes shortage rejection; egg preference switches whole/gram display; count unit rejects 1.5 packs.
9. Update audit-case tests (16->12/8/24 scaling) for new rounding behavior; add zero/negative/tiny-batch/decimal-ingredient/packaging regression cases from audit section G.
10. Add `smoke:policy-settings` exercising a settings change end-to-end against production and wire into smoke:live-audit.

## Verification

- Check: `npm.cmd test`
  Expected: New validation, policy, and contract tests pass; updated scaling expectations pass.
- Check: Save recipe with base yield 0; scale to -12 via UI and direct API
  Expected: Field-level error client-side; 4xx server-side; no NaN/Infinity ever rendered.
- Check: Change gram rounding to 10g, scale 187.5g case
  Expected: 190g displayed after save and refresh.
- Check: `npm.cmd run smoke:policy-settings` against production
  Expected: Pass.

## Rollback

Policy service is a refactor plus additive metadata; revert the commit to restore prior behavior. Deduction-stage default preserves current behavior, so reverting has no stock-movement impact.
