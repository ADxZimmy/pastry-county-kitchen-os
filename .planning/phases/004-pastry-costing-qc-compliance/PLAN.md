# Plan

## Outcome

Pastry County Kitchen OS captures the P2 production-depth controls needed for a serious pastry workflow: conversion rules can be scoped to ingredient state, costing includes labor/packaging/overhead/failure/yield allowances, ingredient master records allergen and storage controls, and production completion writes a QC log with actual-yield and process checkpoints.

## Scope

Included:

- Add state/temperature/formula-context scope to conversion rules.
- Prefer scoped conversions during recipe scaling, costing, stock checks, and production requirements.
- Add structured ingredient allergen and storage profiles.
- Add recipe cost profile for labor, packaging, utility/overhead, failure allowance, and planned yield loss.
- Include non-ingredient cost lines in costing views and recipe/order cost calculations.
- Add production QC log table, API persistence, snapshot loading, and UI display.
- Require a lightweight QC modal before order production completion from order detail and production cards.
- Add tests for normalization, scoped conversion fallback, cost profile math, and QC persistence helpers.
- Add a live Phase 004 smoke script that creates temporary ingredient/recipe/order data, completes production with QC, verifies reload, and archives temporary data.

Excluded:

- Legal food labeling certification.
- Full multi-jurisdiction allergen compliance rules.
- Supplier certificate/document storage.
- Full equipment capacity scheduler.
- Batch-level QC completion for grouped batches beyond per-order production logs.

## Steps

1. Step: Add data contracts and schema.
   - Add `IngredientAllergenProfile`, `IngredientStorageProfile`, `RecipeCostProfile`, `ProductionQcLog`, and conversion scope fields.
   - Add JSON columns and QC log table in `db/schema.sql`.
   - Add live schema drift repair in `api/_db.js` and action setup.

2. Step: Implement API normalization and persistence.
   - Normalize allergen/storage profiles on ingredient save.
   - Normalize recipe cost profile on recipe save.
   - Normalize conversion scope on conversion save/import.
   - Persist production QC logs when an order is produced.

3. Step: Implement scoped conversion behavior.
   - Let `convertUnit` accept ingredient state, temperature state, and formula context.
   - Prefer exact scoped rules, then partial scoped rules, then generic rules.
   - Thread recipe item prep state into scaling/costing and SQL production requirements.

4. Step: Implement expanded costing.
   - Add non-ingredient cost breakdown and effective yield basis.
   - Keep ingredient subtotal visible.
   - Include cost profile fields in recipe form/detail/costing page.

5. Step: Implement allergen/storage UI.
   - Add compact ingredient form controls for contains/may-contain allergens, dietary flags, cross-contact risk, storage temperature/location, humidity/odor sensitivity, opened shelf life, and handling notes.
   - Surface profiles on ingredient detail and inventory export.

6. Step: Implement QC UI.
   - Add production completion QC modal.
   - Show latest QC logs on production/order detail where useful.
   - Keep mobile actions tappable and no-overflow at 320px.

7. Step: Verify locally.
   - Run `npm.cmd test`.
   - Run `npm.cmd run build`.
   - Run `node --check` for the Phase 004 smoke script.
   - Run `git diff --check`.

8. Step: Ship and verify production.
   - Commit and push after local changes.
   - Wait for live deployment to serve the new bundle/API.
   - Run `npm.cmd run smoke:phase4-pastry-depth`.
   - Run `npm.cmd run smoke:live-audit`.

## Verification

- Check: Scoped conversion tests.
  Expected: a state-specific rule is preferred when prep state matches; generic rules still work for legacy recipes.

- Check: Cost profile math.
  Expected: ingredient subtotal, labor, packaging, overhead/utilities, failure allowance, yield-loss basis, total cost, and cost per effective yield are computed deterministically.

- Check: Ingredient profile save/load.
  Expected: allergen and storage profiles save, reload, display, export, and leave legacy ingredients compatible.

- Check: Production QC log.
  Expected: producing an order can persist actual yield, room/mix/oven/bake temperatures/times, sensory notes, and next adjustment; the log is visible after reload.

- Check: Live smoke.
  Expected: temporary Phase 004 data creates, verifies, produces with QC, and archives/cleans up successfully.

## Rollback

All schema additions are additive. If needed, older code can ignore `allergen_profile`, `storage_profile`, `cost_profile`, conversion scope columns, and `production_qc_logs`. Do not remove or rewrite existing ingredient, recipe, order, or conversion records during this phase.
