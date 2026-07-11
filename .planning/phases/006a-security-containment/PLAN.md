# Plan

## Outcome

Anonymous or revoked users cannot mutate stock or invoke maintenance writes, production session signing fails closed without a dedicated secret, and unexpected server failures do not disclose internal details. This gate passes before Phase 007 begins.

## Scope

Included:

- Retire or secure the direct serverless and Express inventory-movement routes by delegating to canonical `inventory.adjust` authorization/validation.
- Authenticate and authorize before maintenance work; restrict `schema.ensure` to Owner/Admin.
- Remove caller-controlled `createdBy`; derive actor from the active DB-backed session.
- Require `SESSION_SECRET` in production and document/preflight required environment values.
- Safe 5xx responses with server-side detail logging and correlation ids.
- Handler-level tests for anonymous, revoked, wrong-role, and authorized access across both entry points.

Excluded:

- Full cookie/CSRF/password-reset migration (Phase 011).
- Removing every runtime migration from bootstrap/actions (Phase 012); this phase stops anonymous/pre-auth execution.
- Full audit-event actor remediation (Phase 007), except the movement route touched here.

## Steps

1. Add failing handler tests proving unauthenticated and revoked calls to `/api/inventory-movements` cannot reach SQL; Baker/Viewer receive 403; Owner/Admin and Inventory Manager use canonical validation.
2. Replace the serverless and Express duplicate mutation bodies with a shared wrapper around `inventory.adjust`, or retire the legacy endpoint after confirming no tracked caller; remove body-provided `createdBy`.
3. Reorder `handleAction` so actor/session/role validation happens before `ensureOperationalTables`; make `schema.ensure` Owner/Admin-only and rate-limited; add direct API regression tests.
4. Change session-secret loading to permit the development fallback only outside production; fail a production preflight when `SESSION_SECRET` is absent; update `.env.example` and deployment notes without storing a secret.
5. Centralize API/Express error responses: known operational 4xx messages remain useful, unexpected 5xx returns a stable message plus correlation id while logging the original error server-side.
6. Add `Cache-Control: private, no-store` to login and authenticated/maintenance responses touched by this phase; Phase 011 centralizes this for all endpoints.
7. Run unit/handler tests, build, dependency audit, `git diff --check`, and targeted unauthenticated live probes that cannot mutate data.
8. Deploy with the owner Git identity, verify the protected routes and environment preflight, then run the existing live smoke family.

## Verification

- Check: unauthenticated/revoked/wrong-role movement requests
  Expected: 401/401/403 before SQL; stock and movement counts unchanged.
- Check: unauthenticated `schema.ensure`
  Expected: 401 and no maintenance/reconciliation query executed.
- Check: production process without `SESSION_SECRET`
  Expected: explicit startup/health failure; no token signed with fallback material.
- Check: forced unexpected database error
  Expected: safe generic 500 with correlation id; raw detail only in server log.
- Check: `npm.cmd test`, `npm.cmd run build`, `npm.cmd audit --audit-level=moderate`, `git diff --check`
  Expected: pass.

## Rollback

Keep the compatibility wrapper small and reversible. Do not restore an unauthenticated mutator or production secret fallback during rollback; if a deployment issue occurs, roll back only the route wiring while retaining the security checks.
