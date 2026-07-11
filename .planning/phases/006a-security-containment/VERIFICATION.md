# Verification

## Automated Checks

- Command: `npm.cmd test`
  Result: Not run; plan-only.
  Notes: Add handler/security tests before implementation is complete.
- Command: `npm.cmd run build`
  Result: Not run; plan-only.
  Notes: Required before deploy.
- Command: `npm.cmd audit --audit-level=moderate`
  Result: Not run; plan-only.
  Notes: Required before deploy.

## Manual Checks

- Check: unauthenticated live mutation/maintenance probes
  Result: Not run.
  Notes: Use only non-mutating assertions and before/after counts.

## Residual Risk

- Risk: Full cookie/CSRF migration and distributed rate limiting remain Phase 011 work.
  Owner: Phase 011.
