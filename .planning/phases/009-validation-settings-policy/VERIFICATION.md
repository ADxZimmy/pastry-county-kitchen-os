# Verification

## Automated Checks

- Command: `npm.cmd test`
  Result: Not run; plan-only.
  Notes: Must include shared frontend/API policy parity and every retained setting contract.
- Command: `npm.cmd run smoke:policy-settings`
  Result: Not implemented or run.

## Manual Checks

- Check: save/reload each setting and inspect affected workflow
  Result: Not run.
  Notes: Restore original settings during cleanup.

## Residual Risk

- Risk: legacy fractional count stock conflicts with new unit policy.
  Owner: Phase 009; flag for operator correction without silent rewrite.
