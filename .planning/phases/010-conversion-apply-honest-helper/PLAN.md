# Plan

## Outcome

Selecting a suggested conversion opens a review modal (original, suggested, edited value, confidence, source) and, on confirm, persists through a role-checked audited server action that is visible in the conversion library and recipe afterward. All assistant/helper surfaces describe the feature honestly. PCO-003 interim closure (full closure with Phase 014).

## Scope

Included:

- Real apply workflow for conversion suggestions (helper page + conversion library + recipe context).
- Review modal with original/suggested/edited value, confidence, source rule, and explicit confirm.
- Server action to persist applied conversions with role checks and audit records; approved vs unverified separation.
- Honest interim labeling: "Kitchen Helper" naming, capability copy, removal of "AI"-implying claims.
- Tests for apply-persist-reload and for the no-toast-without-write guarantee.

Excluded:

- Model-backed assistant, server-side orchestration, follow-up context (Phase 014).
- New conversion mathematics (engine already supports ingredient-specific rules).

## Steps

1. Inventory every assistant/conversion action in App.tsx that ends in `notify(...)` without an API call; list which imply persistence.
2. Build the ConversionReviewModal (reuse dialog a11y hooks): original value, suggested value, editable final value, confidence badge, source rule, confirm/cancel.
3. Add/extend `conversion.applyRule` server action: role-checked, validates the rule, upserts with verified flag + provenance (who approved, source), writes audit entry.
4. Wire "Use this conversion" and equivalent actions through the modal -> action -> reload; success toast only after server confirmation.
5. Rename assistant surfaces to "Kitchen Helper" via a shared string constant; update nav labels, page headers, empty states, and helper copy to state it answers from saved data with deterministic rules.
6. Update tests: applying a conversion persists and survives reload; unconfirmed suggestions never mutate; role-restricted users cannot apply.
7. Add smoke assertions (extend an existing conversion smoke or add `smoke:conversion-apply`) verifying a conversion applied in production appears in the library after refresh, then archive the test rule.

## Verification

- Check: `npm.cmd test`
  Expected: Apply-flow and role tests pass.
- Check: Manual - select a suggested conversion, edit the value, confirm, refresh
  Expected: Rule visible in conversion library with verified provenance; recipe context reflects it.
- Check: Manual - cancel the review modal
  Expected: No data change, no success toast.
- Check: grep for "AI Assistant" strings in src/
  Expected: No overstated AI claims remain on shipped surfaces.
- Check: Conversion smoke against production
  Expected: Pass.

## Rollback

UI + one additive server action; revert the commit. Applied rules already persisted remain valid data.
