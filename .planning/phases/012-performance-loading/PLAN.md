# Plan

## Outcome

Hashed assets cache immutably, authenticated HTML/data remain short-lived/private, the initial route loads only required client code, high-growth data uses paginated role-filtered endpoints, hot-path schema DDL is removed, and tracked CI plus Web Vitals/Lighthouse budgets provide repeatable evidence. PCO-010, PCO-011, and RS-007 close at the MVP gate.

## Scope

Included:

- Correct Vercel caching rules verified on production.
- Mechanical page extraction and React.lazy route chunks.
- Preservation/measurement of server-only dynamic import parsers.
- Dashboard summary plus paginated orders/audit/movements with shared auth/projection.
- Incremental bootstrap shrink and targeted cache invalidation.
- Explicit schema migrations replacing request-path DDL.
- Baseline GitHub CI, public-route Lighthouse, authenticated performance job, and Web Vitals monitoring.

Excluded:

- Full retirement of bootstrap for small bounded collections in the first slice.
- Offline production mode.
- Treating public login-page Lighthouse as evidence for the authenticated application.

## Delivery Slices

### 012-A Caching, CI, And Measurements

1. Capture current build chunk sizes, serverless import-function bundle/cold-start, bootstrap payload by role, API timings, and production cache headers as a before baseline.
2. Add specific Vercel rules: hashed `/assets/*` one-year immutable; `/`/`index.html` short-lived; authenticated APIs remain private/no-store from Phase 011. Verify rule precedence in production.
3. Add a tracked CI workflow for clean install, `npm test`, `npm run build`, dependency audit, and `git diff --check`. Keep secret-dependent live smokes in a protected/manual job.
4. Add public-route Lighthouse budgets and a separate controlled authenticated preview/performance job. Record which routes each score covers.

### 012-B Client Route Chunks

5. Mechanically extract page components from the 3,201-line App.tsx without behavior changes; run tests/build/navigation smoke after each small group.
6. Convert heavy/secondary pages to React.lazy with accessible loading/error/retry fallbacks; inspect build output so shared dependencies are not accidentally duplicated.
7. Confirm `read-excel-file`, `mammoth`, and `pdf-parse` remain server-only dynamic imports in `api/_imports.js`; measure serverless function size/cold start instead of adding redundant client dynamic imports.

### 012-C Route-Scoped Data And Migrations

8. Create one shared backend authorization and role-projection layer, then implement `/api/dashboard/summary` and cursor-paginated orders, audit, and movements endpoints with bounded limits and stable ordering.
9. Migrate Dashboard, Orders, Audit Reports, and ingredient history to route-scoped loading with empty/error/retry states and targeted mutation invalidation. Preserve search/filter context from Phase 005/013.
10. Add per-role response-shape tests proving Viewer/Baker/Inventory Manager cannot regain staff/audit/private settings data through new endpoints.
11. Remove migrated high-growth collections from bootstrap only after all consumers and smokes use the new endpoints; record payload reduction.
12. Move remaining `ALTER/CREATE/repair UPDATE` work from bootstrap/actions/auth into explicit idempotent migration scripts with a deploy preflight. Runtime code may verify schema version but must not mutate schema on ordinary requests.
13. Enable Web Vitals/Speed Insights with privacy review and alert ownership; update performance evidence and run the full smoke family.

## Verification

- Check: production headers
  Expected: hashed assets are immutable for one year; HTML is short-lived; authenticated data is private/no-store.
- Check: clean CI run
  Expected: install, tests, build, dependency audit, diff check, and public performance budget pass without production credentials.
- Check: `npm.cmd run build`
  Expected: multiple route chunks, entry gzip within the agreed budget, and parser packages absent from client output.
- Check: serverless import worker measurement
  Expected: parser dependencies load only when the import worker needs them; cold-start/function-size evidence is recorded.
- Check: role-specific paginated endpoint tests
  Expected: stable pagination and no cross-role sensitive-field regression.
- Check: ordinary bootstrap/action requests
  Expected: no schema-changing SQL; migration preflight reports the expected schema version.

## Rollback

Ship slices separately. Keep bootstrap fields until route consumers are proven. Header rules, page extraction, and endpoints can revert independently; explicit migrations remain additive. Do not restore pre-auth or hot-path schema mutation during rollback.
