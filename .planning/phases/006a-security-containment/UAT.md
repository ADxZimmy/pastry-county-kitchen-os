# UAT

## Scenario

Attempt stock adjustment and schema maintenance while signed out, with a revoked session, and with each staff role; then complete one controlled temporary stock adjustment as an authorized inventory role.

## Result

Partially covered on 2026-07-11; the full role-matrix UAT has not been run.

## Notes

Automated/runtime evidence proves signed-out `schema.ensure` and inventory actions are rejected before DB access, wrong-role `schema.ensure` is 403, the legacy movement route is 410, revoked Viewer bootstrap is rejected, and Owner/Admin smoke mutations self-clean. The remaining manual scenario is the complete revoked/every-role movement-and-schema matrix plus explicit actor attribution and reversal/correction verification; do not describe this UAT as fully passed until that evidence is recorded.
