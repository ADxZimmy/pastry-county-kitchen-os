# Plan

## Outcome

Hashed assets cache immutably for a year, the initial route loads only its own code (parsers load solely on Imports), high-growth history data is paginated behind route-scoped endpoints, and a Lighthouse CI budget plus Web Vitals monitoring guard against regression. Audit findings PCO-010 and PCO-011 closed.

## Scope

Included:

- vercel.json caching headers for `/assets/*` (immutable) and short-lived index.html.
- Page extraction from App.tsx into modules + React.lazy route chunks with suspense fallbacks.
- Dynamic import of spreadsheet/DOCX/PDF parsing on the Imports screen only.
- `/api/dashboard/summary` and paginated `/api/orders`, `/api/audit`, `/api/movements`; migrate those screens off bootstrap with loading/empty/error/retry states.
- Web Vitals monitoring and Lighthouse CI thresholds.

Excluded:

- Full bootstrap retirement for small collections (settings, suppliers, conversion rules) - follow-up once history data is migrated.
- Offline-friendly production view (post-MVP roadmap).

## Steps

1. Add vercel.json header rules: `/assets/(.*)` -> `Cache-Control: public, max-age=31536000, immutable`; `/index.html` and `/` -> `no-cache`; deploy and curl-verify.
2. Extract page components from App.tsx into src/pages/* modules (mechanical, no behavior change); run tests + navigation smoke.
3. Convert heavy routes (Imports, Reports, Archives, Settings, Suppliers, Helper, Recipes detail/edit) to React.lazy with suspense fallbacks; verify chunking in build output.
4. Move parser usage behind `await import(...)` on the Imports screen; confirm parser code is absent from the entry chunk.
5. Implement `/api/dashboard/summary` (counts + due-today aggregates) and paginated `/api/orders`, `/api/audit`, `/api/movements` with cursor or page params, reusing existing auth + no-store helpers.
6. Migrate Dashboard, Orders list, Audit Reports, and ingredient movement history to the new endpoints with loading/empty/error/retry states and post-mutation invalidation; trim the bootstrap payload of migrated history collections once all consumers moved.
7. Enable Vercel Speed Insights / Web Vitals reporting.
8. Add Lighthouse CI (budget: mobile perf >= 85, initial compressed JS <= 150 kB, LCP <= 2.5 s, CLS <= 0.1, TBT <= 200 ms) to the workflow; fail on budget breach.
9. Update smokes for paginated endpoints; run full test suite and umbrella smoke against production.

## Verification

- Check: curl production asset URL
  Expected: `Cache-Control: public, max-age=31536000, immutable`; index.html short-lived.
- Check: `npm.cmd run build` output
  Expected: Multiple route chunks; entry chunk gzip <= 150 kB; parser libs in Imports-only chunks.
- Check: `npm.cmd test` + navigation smoke
  Expected: Pass after page extraction and lazy conversion.
- Check: Orders/Audit pages with large datasets
  Expected: Paginated loads with working retry/empty states; mutations refresh affected pages only.
- Check: Lighthouse CI run
  Expected: Budgets met.

## Rollback

Header rules and new endpoints are additive; lazy routes can revert to static imports commit-by-commit. Keep bootstrap fields until migration verified, so reverting frontend restores prior data flow.
