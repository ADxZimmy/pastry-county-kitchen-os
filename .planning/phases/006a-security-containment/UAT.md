# UAT

## Scenario

Attempt stock adjustment and schema maintenance while signed out, with a revoked session, and with each staff role; then complete one controlled temporary stock adjustment as an authorized inventory role.

## Result

Not run; plan-only.

## Notes

Signed-out/revoked requests must not reach SQL. Unauthorized roles must receive 403. The authorized temporary adjustment must record the authenticated actor and be reversed/cleaned up with a correction movement.
