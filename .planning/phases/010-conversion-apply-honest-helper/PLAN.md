# Plan

## Outcome

Every conversion action says exactly what it will change. Saving a reusable rule updates the Conversion Library; applying a conversion to a recipe updates a named recipe item through a review and normal recipe-save transaction; free-form helper results can open a prepared editor but never claim persistence. The deterministic feature is honestly labelled Kitchen Helper. PCO-003 reaches demo-safe interim closure.

## Scope

Included:

- Complete inventory of helper/conversion actions and their intended target.
- Review modal with target record, original/suggested/final values, source, confidence, scope, and provenance.
- Separate audited actions for rule suggestion/approval and recipe-item application.
- Save/reload verification and success messaging only after the intended record actually changed.
- Shared Kitchen Helper naming/capability copy.

Excluded:

- Model-backed orchestration, conversation context, or AI branding (Phase 014).
- Direct model/helper mutations without review (permanently excluded).

## Steps

1. Inventory every helper/conversion button and classify it as `calculate only`, `save unverified rule`, `verify rule`, `apply to recipe item`, or `open editor`. Remove ambiguous `Use this conversion` copy until a target is known.
2. Define an explicit review contract: target type/id, original quantity/unit, suggested quantity/unit, editable final value, source rule/evidence, confidence, formula/prep scope, actor, and intended persistence action.
3. Build an accessible Conversion Review modal using the existing focus/inert behavior. Cancel performs no write and no success toast.
4. Add/extend role-checked server actions:
   - rule suggestion/approval persists provenance (`suggestedBy`, `approvedBy`, timestamps, source and scope) and verified state;
   - recipe-item apply validates the current original value to prevent stale overwrite, preserves import/source-cost evidence, writes the approved conversion provenance, and saves through the normal recipe transaction.
5. For free-form helper results without a recipe target, offer `Save as unverified rule` or `Open recipe editor`; do not state that a recipe was updated.
6. After server success, reload and assert the exact target changed. If reload does not match, show an error rather than a success toast.
7. Rename navigation, page titles, copy, exports, and settings references through one shared capability descriptor to `Kitchen Helper`; describe deterministic data sources and limitations.
8. Add tests for stale-target conflict, cancel/no-write, role denial, rule persistence, recipe-item persistence, provenance preservation, refresh, and the absence of toast-only persistence claims.
9. Add `smoke:conversion-apply` with temporary rule/recipe data and cleanup; run it before Phase 015-A.

## Verification

- Check: save a rule, refresh Conversion Library
  Expected: the exact rule and provenance persist; no recipe-change claim is shown.
- Check: apply to a named recipe item, refresh recipe detail/edit
  Expected: final quantity/unit and provenance persist while original import/source-cost evidence remains available.
- Check: cancel or submit against a stale original value
  Expected: no mutation; cancel is silent, stale write returns a conflict for re-review.
- Check: runtime-source scan for `AI Assistant` and ambiguous `Use this conversion`
  Expected: shipped deterministic surfaces use honest Kitchen Helper/calculate/save/apply wording.
- Check: `npm.cmd test`, `npm.cmd run build`, `npm.cmd run smoke:conversion-apply`
  Expected: pass with cleanup complete.

## Rollback

Review UI and server actions are additive. Persisted approved rules/recipe changes remain valid auditable data. Rollback may hide new actions but must not relabel a toast-only action as successful persistence.
