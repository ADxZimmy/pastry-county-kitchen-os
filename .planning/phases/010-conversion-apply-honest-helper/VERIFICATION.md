# Verification

## Automated Checks

- Command: `npm.cmd test`
  Result: Passed; 145/145 tests across 6 files. New tests assert the shared helper name and capability copy make no AI claim and state what the helper does not do.
- Command: `npm.cmd run build`
  Result: Passed; tsc + Vite clean.
- Command: `npm.cmd run smoke:conversion-apply`
  Result: Not implemented; planned with the 010-B recipe-item apply. The existing umbrella smoke covers the helper page and conversion library paths.

## Slice 010-A — honest helper and truthful actions (deployed 2026-07-11, commits `926861a`, `e4d3f1e`)

Action inventory and disposition (plan step 1):

| Surface | Was | Now |
|---|---|---|
| Nav entries, header button, page section | "AI Assistant" / "Ask AI" | `HELPER_NAME` = "Kitchen Helper" + capability copy |
| Conversion page primary button | "Use this conversion" -> toast only, wrote nothing | Removed. Replaced by "Save as verified rule" and "Save as unverified rule" (both persist via the audited `conversion.save`) and "Open a recipe to apply it" (navigates) |
| Recipe builder "Apply saved conversions on save" | toast only | Plain explanatory text (it described behaviour, not an action) |
| Recipe builder "Paste recipe and structure" | toast only | Navigates to Kitchen Helper |
| Conversion library Edit / Mark Verified / Delete | already real | unchanged (`conversion.save` / `conversion.verify` / `conversion.delete`) |
| New rule saves | source "AI estimate" | "measured in kitchen" / "manual entry" |

- Check: runtime-source scan for `AI Assistant`, `Ask AI`, `Use this conversion`
  Result: Passed; none remain in `src/`.
- Check: deployed production bundle string scan
  Result: Passed against the live bundle — "Kitchen Helper" present; "AI Assistant", "Ask AI", and "Use this conversion" all absent. The honest copy actually reached users, not just source.
- Check: `npm.cmd run smoke:live-audit`
  Result: Passed. The first run failed because `phase2-rerun-smoke.mjs` drove the UI by the old "Ask AI" button/heading; the smoke was updated to "Kitchen Helper" and the full suite then passed. UI-copy changes are gated by the live smoke for exactly this reason.

## Slice 010-B — reviewed conversion apply (deployed 2026-07-11, commit `0511095`)

- `conversion.applyToRecipeItem` (Owner/Admin + Baker) is the only path that changes a recipe from a conversion. It validates the target unit against the `recipe_items` unit constraint and a positive quantity, then refuses a stale write via `conversionApplyConflict`: if the stored line no longer matches the before-value the review was opened against, it returns 409 rather than overwriting another edit. Provenance (converted-from quantity/unit, rule id, actor, timestamp) is merged into `prep_state` so import/source-cost evidence survives, and the change is audited with the real actor.
- Conversion Review modal on Recipe Detail ("Convert unit" per line) shows the target line, current value, suggested value with source rule and confidence, an editable final value, and a warning when no verified rule covers the pair. Cancel writes nothing and shows no toast. After the server call it reloads and asserts the line actually changed, showing an error instead of a success toast if it did not.
- `convertUnit` now returns the matched `ruleId`; its no-rule fallback says "No saved rule" instead of "AI estimate required".
- Command/check: conversion-apply probe against production (temp ingredient/recipe with import evidence, self-cleaning; script removed)
  Result: 9/9 passed. Reviewed apply changed the line 2 cup -> 240g and survived reload; a stale apply was refused 409 ("now 2cup, not 99cup") with nothing changed; import evidence (`sourceFile`, `sourceLineAmount`, `ingredientState`) preserved; provenance recorded (from 2cup, by the acting user); replaying the used review refused 409 with the line still 240g.
- Command/check: `npm.cmd run smoke:live-audit`
  Result: Passed; all child smokes green, temporary records archived.
- `smoke:conversion-apply` is not yet packaged as a repeatable script; the probe above is the interim evidence and is a good basis for it during 015-A.

## Phase status

Phase 010 is COMPLETE for its demo-trust scope: the helper is honestly labelled, no action claims a change it did not make, and applying a conversion to a recipe is a real reviewed, provenance-preserving, stale-safe write. PCO-003 is closed for the Demo Trust Gate; a genuine model-backed assistant remains Phase 014 (and is explicitly optional, gated on a provider/retention/budget decision).

## Residual Risk

- Risk: a reviewed apply changes one line at a time; there is no bulk apply. Acceptable — bulk conversion without per-line review is exactly what the audit warned against.
- Note: full PCO-003 closure in the "real AI" sense is Phase 014 only if a provider is approved; otherwise the honest Kitchen Helper is the accepted product outcome.
