# Verification

## Automated Checks

- Command: `npm.cmd run smoke:uat-core`
  Result: Not implemented or run.
  Notes: D1 gate after Phase 010.
- Command: `npm.cmd run smoke:uat-full`
  Result: Not implemented or run.
  Notes: R1 gate after Phase 014.
- Command: full local/CI/live gate family
  Result: Not run.

## Manual Checks

- Check: run manifest and cleanup report review
  Result: Not run.
- Check: fresh external audit
  Result: Not requested.

## Residual Risk

- Risk: production smoke leaves immutable audit/ledger evidence even after records are archived/corrected.
  Owner: Phase 015; disclose retained evidence and never touch non-manifest records.
