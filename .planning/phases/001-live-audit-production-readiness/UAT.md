# UAT

## Scenario

After Phase 001 implementation, an Owner/Admin signs in to the live app, runs the core bakery workflows from the June 22 audit, and confirms that sensitive data is not exposed without login.

## Result

Not run. This phase is currently a concrete plan only.

## Notes

UAT should use the live deployment and ignored local credentials, then clean up temporary `AUDIT-*` records. The external audit should be rerun only after `npm run smoke:live-audit` and targeted unauthenticated API checks pass.
