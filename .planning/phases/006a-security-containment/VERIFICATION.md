# Verification

## Automated Checks

- Command: `npm.cmd test`
  Result: Passed; 94/94 tests across 6 files (was 80/5). New `api/security-containment.test.js` adds 14 tests.
  Notes: Covers schema.ensure Owner/Admin gating, handleAction rejecting anon (401) and wrong-role (403) callers before any DB access, safeErrorResponse masking unexpected 500s while preserving explicit 4xx/503 messages, and sessionSecret failing closed in production.
- Command: `npm.cmd run build`
  Result: Passed; tsc + Vite build produced 334.46 kB JS (93.82 kB gzip), 21.96 kB CSS (5.32 kB gzip).
  Notes: No TypeScript regressions from the API/server changes.
- Command: `npm.cmd audit --audit-level=moderate`
  Result: Passed; 0 vulnerabilities.
- Command: `git diff --check`
  Result: Passed; no whitespace errors (only benign LF->CRLF notices).

## Manual Checks

- Check: Runtime probe of shipped handlers without a database (`node verify-006a.mjs`, temporary script, removed after use)
  Result: 7/7 passed.
  Notes:
    - RS-001: `api/inventory-movements.js` default handler returns 410 with "Use the authenticated inventory.adjust action via POST /api/actions." and runs no SQL.
    - RS-004: `api/health.js` returns 503 with `sessionSecret: "missing"` when `VERCEL_ENV=production` and no `SESSION_SECRET` (even with `DATABASE_URL` set), and 200 once `SESSION_SECRET` is configured.
    - RS-002: `handleAction` with a throwing sql stub rejected anon `schema.ensure` (401), anon `inventory.adjust` (401), and Baker `schema.ensure` (403) with `touchedDb=false` in every case, proving authorization runs before `ensureOperationalTables`.

- Check: Confirmed no tracked caller of the legacy `/api/inventory-movements` route before retiring it
  Result: Passed.
  Notes: `src/App.tsx` (line ~1466) and `scripts/regression-audit-smoke.mjs` both use the `inventory.adjust` action via `/api/actions`; the only remaining code reference to the HTTP route was its own definition.

- Check: Confirmed `schema.ensure` callers authenticate as Owner/Admin
  Result: Passed.
  Notes: `scripts/phase3-pastry-smoke.mjs` and `scripts/phase4-pastry-depth-smoke.mjs` call it with a `Bearer` token from an owner login, so Owner/Admin-only gating does not break existing smokes.

## Pending (post-deploy, needs production access)

- Deploy with the owner Git identity, verify the Vercel environment preflight (health 503 until `SESSION_SECRET` is set in Vercel), then run the existing live smoke family.
- Confirm production `SESSION_SECRET` is configured in Vercel before/after deploy so login and session verification do not fail closed for real users.
- Live probe: unauthenticated `POST /api/inventory-movements` returns 410; unauthenticated `POST /api/actions {action:"schema.ensure"}` returns 401 with no schema change.

## Residual Risk

- Risk: Setting `SESSION_SECRET` in production is required by this change; if it is not configured in Vercel before deploy, login/bootstrap/actions fail closed (503) for all users.
  Owner: Deploy step — configure `SESSION_SECRET` in Vercel env first, verify via `/api/health`.
- Risk: `private, no-store` was applied to login/actions/bootstrap/produced only; full centralization across every endpoint remains Phase 011 work.
  Owner: Phase 011.
- Risk: Full cookie/CSRF migration and distributed rate limiting remain Phase 011 work.
  Owner: Phase 011.
