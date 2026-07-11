# Verification

## Automated Checks

- Command: `npm.cmd test`
  Result: Not run; plan-only.
  Notes: Must cover cookie flags, hashed sessions/resets, CSRF, rotation/revocation, shared throttling, no-store, and bearer removal.
- Command: cookie-only live smoke family
  Result: Not implemented or run.

## Manual Checks

- Check: production browser login/logout/reset and storage inspection
  Result: Not run.
  Notes: DNS delivery evidence may remain an explicitly blocking external item.

## Residual Risk

- Risk: email DNS/domain verification may block end-to-end delivery proof.
  Owner: Certification Evidence Closeout; token lifecycle still requires isolated verification.
