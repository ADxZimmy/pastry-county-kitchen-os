# Context

## Goal

Remove the scaling cliff: immutable caching for hashed assets, route-level code splitting with lazily loaded parser libraries, and route-scoped paginated data loading replacing the monolithic bootstrap. Closes audit findings PCO-010 and PCO-011.

## Relevant Files

- Path: vercel.json
  Why it matters: No Cache-Control headers configured; production serves hashed assets with `max-age=0, must-revalidate` per the audit.
- Path: src/App.tsx (3,201 lines) and src/main.tsx
  Why it matters: Entire app ships as one 334 kB bundle (93.8 kB gzip); all pages in one module, no React.lazy.
- Path: api/bootstrap.js
  Why it matters: Single broad snapshot (recipes, inventory, orders, movements, audit, settings, suppliers...) loaded after login; grows unboundedly with history.
- Path: api/_imports.js and import parser deps (read-excel-file, mammoth, pdf-parse client paths)
  Why it matters: Parser libraries should load only on the Imports screen.
- Path: src/data.ts, src/lib/backend.ts
  Why it matters: Frontend snapshot state assumes one global payload; incremental migration must keep this working per-route.

## Decisions

- Decision: Ship the quick wins first inside this phase: `/assets/*` -> `Cache-Control: public, max-age=31536000, immutable` with short-lived index.html, plus React.lazy route chunks and dynamic parser imports.
  Reason: Low-risk, immediate PCO-011 closure and bundle reduction toward the 150 kB budget.
- Decision: Introduce route-scoped endpoints incrementally: `/api/dashboard/summary` plus paginated `/api/orders`, `/api/audit`, `/api/movements` first (highest growth rate), keeping bootstrap for the remaining small collections until each migrates.
  Reason: Audit PCO-010; a big-bang bootstrap replacement risks regressions across every page - pagination of history data removes the actual scaling cliff.
- Decision: Add loading/empty/error/retry states per migrated route and targeted cache invalidation after mutations (lightweight fetch cache; adopt TanStack Query only if the hand-rolled cache gets complex).
  Reason: Audit recommendation while respecting the repo's current no-extra-framework style.
- Decision: Enable Vercel Speed Insights / Web Vitals and add a Lighthouse CI budget (mobile >= 85, initial compressed JS <= 150 kB, LCP <= 2.5 s, CLS <= 0.1, TBT <= 200 ms).
  Reason: Audit performance budget table; prevents regression after the split.

## Risks

- Risk: Code-splitting a single 3,201-line App.tsx requires extracting pages into modules first.
  Mitigation: Mechanical extraction per page with no behavior change, verified by the existing test suite and navigation smoke before adding lazy().
- Risk: Pagination changes API contracts consumed by smokes and the UI.
  Mitigation: Additive endpoints; bootstrap keeps working during migration; remove fields from bootstrap only after every consumer moved.
- Risk: Route-level fetching may break offline-ish assumptions of the snapshot model.
  Mitigation: Keep a shared cache layer so cross-page references (names, ids) resolve; document the tradeoff.
