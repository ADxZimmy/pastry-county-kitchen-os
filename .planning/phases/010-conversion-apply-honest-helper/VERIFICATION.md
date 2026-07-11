# Verification

## Automated Checks

- Command: `npm.cmd test`
  Result: Not run; plan-only.
  Notes: Must cover calculate/save-rule/apply-recipe distinctions, cancel/no-write, stale conflicts, roles, provenance, and refresh.
- Command: `npm.cmd run smoke:conversion-apply`
  Result: Not implemented or run.

## Manual Checks

- Check: helper copy and each conversion action target
  Result: Not run.
  Notes: No toast may imply a recipe changed unless the named recipe item persists after reload.

## Residual Risk

- Risk: recipe application may overwrite imported source evidence.
  Owner: Phase 010; preserve original/source-cost provenance in the save transaction.
