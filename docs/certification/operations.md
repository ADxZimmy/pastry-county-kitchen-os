# Operations Certification Gate

## Automated Checks

- `/api/health` reports a healthy database.
- Build succeeds.
- Unit tests pass.
- Live smoke/audit checks pass.
- Temporary test data is cleaned up.
- Certification evidence is timestamped, zipped, and stored outside the app source.

## Manual Sign-Off

- Backup/restore drill completed and timestamped.
- Rollback drill completed or Vercel rollback process confirmed.
- Alert routing owner named for production runtime errors.
- Incident response notes exist for auth/session, database outage, email outage, and failed production deduction.
- Environment-variable inventory is reviewed without exposing secret values.

## Blocking Criteria

No backup/restore confidence, no rollback path, unowned production alerts, or untracked evidence prevents 100/100.
