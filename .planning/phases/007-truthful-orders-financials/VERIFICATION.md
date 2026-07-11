# Verification

## Automated Checks

- Command: `npm.cmd test`
  Result: Not run; plan-only.
  Notes: Must include event isolation/rollback/actor and server-canonical pricing cases.
- Command: `npm.cmd run build`
  Result: Not run; plan-only.
- Command: `npm.cmd run smoke:orders-pricing`
  Result: Not implemented or run.

## Manual Checks

- Check: two-order timeline and varied-price comparison after refresh
  Result: Not run.
  Notes: Verify no cross-order events, invented shortages, or shared/default selling price.

## Residual Risk

- Risk: legacy orders lack truthful event/pricing history.
  Owner: Phase 007; show explicit legacy/missing states and backfill only real creation facts.
