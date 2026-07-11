# Plan

## Outcome

Invalid recipe/order quantities are rejected at client and server boundaries; scaling cannot emit NaN, Infinity, zero, or negative requirements. A dependency-free shared policy contract governs both frontend display and backend transaction decisions. Every retained setting demonstrably changes behavior after save/reload, and count inventory follows explicit divisibility/increment rules. PCO-006, PCO-007, and PCO-008 close at the Demo Trust Gate.

## Scope

Included:

- Client and server validation for recipe, scaling, order, price, and stock numeric inputs.
- Runtime-neutral shared policy module plus TypeScript declarations and parity fixtures.
- Gram/count rounding and mathematical-versus-practical quantity display.
- Deduction-stage and negative-inventory semantics integrated with Phase 008's idempotent transaction.
- Settings inventory: enforce, rename, or remove every exposed policy control.
- Per-ingredient `allowsDecimals` and `minimumIncrement` consistently enforced.

Excluded:

- Model orchestration (Phase 014).
- Allowing any assistant/model to mutate without explicit review; no setting may weaken that invariant.

## Delivery Slices

### 009-A Validation And Rounding

1. Inventory all numeric trust boundaries: recipe base yield/items, scaling target, order requested yield and sale quantity, prices/discount/tax, shopping purchase quantities/costs, and inventory adjustments.
2. Add dependency-free validation helpers shared by API and frontend: required finite number, positive/non-negative range, maximum bounds where operationally justified, and field-keyed errors.
3. Guard `scaleRecipe` itself and every server path that calculates requirements, especially `recipe.save` and `order.save`; HTML `min`/`step` is convenience, not enforcement.
4. Implement shared rounding fixtures for 16->12/8/24, 187.5g at 1/5/10g, tiny egg batches, liquid decimals, and packaging. Display mathematical and practical quantities when rounding changes an indivisible item.
5. Deploy and run a validation/scaling smoke before policy transaction changes.

### 009-B Shared Settings Contract

6. Add a pure shared module (for example `shared/policy.js` and `shared/policy.d.ts`) consumed by both `src/lib/kitchen.ts` and API code. Keep formatting-only UI helpers separate from server transaction policy.
7. Enumerate every Settings control and assign one outcome: enforce with contract test, rename with migration/copy update, or remove from UI and deprecate storage. In particular, `requireAiConversionConfirmation` cannot disable the mandatory review/confirmation invariant.
8. Wire `defaultDeductionStage` to the Phase 008 idempotent completion service for confirmation/start/completion. Each lifecycle action checks a unique deduction record so moving through later stages cannot deduct twice.
9. Define negative-inventory behavior: disabled blocks transaction; enabled records an explicit aggregate deficit/backorder while FEFO lots remain at zero and the order/UI reports shortage. Test switching the setting after prior movements.
10. Add save/reload contract tests for every retained setting and parity tests proving frontend previews match backend outcomes.

### 009-C Unit Divisibility

11. Add per-ingredient `allows_decimals` and `minimum_increment` with safe defaults: pcs/pack/box/roll whole; measured mass/volume decimal. Do not rewrite legacy fractional records automatically; flag them for operator correction.
12. Enforce increment rules in ingredient forms, API saves/adjustments, scaling practical quantities, and shopping purchases. Validate that the increment divides the submitted quantity within a defined decimal tolerance.
13. Add `smoke:policy-settings` covering save/reload, rounding, deduction stage idempotency, negative-inventory behavior, and rejection of 1.5 indivisible packs; wire it into the umbrella smoke after stabilization.

## Verification

- Check: `npm.cmd test` and `npm.cmd run build`
  Expected: validation, shared-policy parity, settings contract, divisibility, and existing tests pass.
- Check: direct API cases with base/target/item/order quantities of 0, negative, NaN-like strings, Infinity-like strings, and extreme values
  Expected: safe field errors and no persisted records or calculations.
- Check: save gram rounding 10g, then refresh and scale 187.5g
  Expected: practical 190g with the unrounded mathematical value visible where useful.
- Check: each retained setting changed one at a time
  Expected: the documented workflow changes after save/reload; removed settings are absent and cannot imply policy.
- Check: `npm.cmd run smoke:policy-settings`
  Expected: pass against production with original settings restored in cleanup.

## Rollback

Ship slices separately and keep new metadata additive. Preserve Phase 008 idempotency constraints during rollback. If shared policy integration fails, disable affected setting choices rather than reverting to controls that silently do nothing.
