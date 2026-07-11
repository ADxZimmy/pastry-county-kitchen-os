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

## Production Deployment (2026-07-11)

- Check: Production secret and deployment
  Result: Passed.
  Notes: A generated 48-byte base64url `SESSION_SECRET` was configured as a sensitive Production variable on the existing Vercel project; its value was not printed or stored in the repository. Deployment `dpl_EHgWLn3YWvWRhwY7U9wYUWU5VSCi` reached Ready and serves the canonical `https://pastry-county-kitchen-os.vercel.app` alias.
- Check: `GET /api/health`
  Result: HTTP 200 with `{"ok":true,"database":"neon","sessionSecret":"configured"}`.
- Check: Unauthenticated `POST /api/inventory-movements`
  Result: HTTP 410 with the retired-route guidance.
- Check: Unauthenticated `POST /api/actions {"action":"schema.ensure"}`
  Result: HTTP 401 before schema maintenance.
- Command: `npm.cmd run smoke:live-audit`
  Result: Passed against production after teaching the umbrella runner to wait out the existing five-login/60-second window between its fifth and sixth Owner/Admin logins.
  Notes: Phase 2 rerun, Milestone 7, regression audit, Phase 3, Phase 4, navigation routing, and import onboarding all passed. Cleanup verified `{"smokeUsers":0,"activeSmokeIngredients":0,"fefoOverstatements":0}`.

## Residual Risk

- Risk: Rotating or removing `SESSION_SECRET` invalidates existing sessions; a missing value makes authenticated production routes fail closed with 503.
  Owner: Operations — rotate deliberately, redeploy, verify `/api/health`, and expect a one-time sign-in reset. Never restore the former fallback.
- Risk: `private, no-store` was applied to login/actions/bootstrap/produced only; full centralization across every endpoint remains Phase 011 work.
  Owner: Phase 011.
- Risk: Full cookie/CSRF migration and distributed rate limiting remain Phase 011 work.
  Owner: Phase 011.
