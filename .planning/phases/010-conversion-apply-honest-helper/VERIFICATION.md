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

## Remaining for Phase 010 (slice 010-B)

- Conversion Review modal with target record, original/suggested/editable final value, source rule, confidence, scope and provenance.
- A role-checked recipe-item apply action that validates the current original value (stale-write conflict), preserves import/source-cost evidence, records approved-conversion provenance, and saves through the normal recipe transaction.
- Reload-and-assert after success, plus `smoke:conversion-apply`.

## Residual Risk

- Risk: recipe application may overwrite imported source evidence.
  Owner: Phase 010-B; preserve original/source-cost provenance in the save transaction.
- Note: PCO-003 reaches honest/demo-safe status with 010-A (no overstated AI framing, no action that claims a change it did not make). Full closure still needs 010-B's reviewed apply, and Phase 014 for any genuine model-backed assistant.
