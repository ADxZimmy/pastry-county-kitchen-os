# Verification

## Slice 012-A — caching, CI, and measurement (deployed 2026-07-19, commits `40751c7`, `220bdc1`, `becf7a2`)

### Baseline, measured before changing anything

`npm run perf:baseline` (new, `scripts/perf-baseline.mjs`) records what production actually serves, so this phase can show a before and after rather than assert an improvement.

| | Before | After |
|---|---|---|
| `/assets/*.js`, `*.css` | `public, max-age=0, must-revalidate` | `public, max-age=31536000, immutable` |
| `/` and `/index.html` | `public, max-age=0, must-revalidate` | unchanged, now explicit |
| authenticated APIs | `private, no-store` (Phase 011) | unchanged |

Vite stamps a content hash into every asset filename, so a changed file is a changed URL and immutable caching cannot serve stale code. The HTML shell is deliberately kept revalidating, because it names the current asset hashes — a cached copy would pin a browser to a dead deploy.

Verified live: immutable headers appeared 45 seconds after deploy and were confirmed on both the JS and CSS assets.

### What the measurement changed about the phase

Two findings contradict assumptions in the plan and should steer the remaining slices:

1. **The client bundle is not the problem.** The entry chunk is **96.3 kB gzipped**, already inside the audit's own ≤150 kB budget. The audit quoted 334 kB, which is the *uncompressed* figure; the compressed number was always within budget. Route splitting (012-B) therefore buys much less than the plan assumed.
2. **The bootstrap payload is the real scaling cliff.** `/api/bootstrap` returns **448.9 kB of JSON in 1189 ms** for an Owner/Admin. Roughly half is history no page needs on first paint:

   | Collection | Rows | Size |
   |---|---|---|
   | auditLogs | 100 (capped) | 110.4 kB |
   | recipeItems | 266 | 108.7 kB |
   | inventoryMovements | 200 (capped) | 65.2 kB |
   | ingredientBatches | 175 (capped) | 48.8 kB |
   | ingredients | 78 | 32.0 kB |
   | appUsers | 66 | 16.3 kB |

   Several of these are **already silently truncated** by server-side `LIMIT`s, so the payload is simultaneously too large and incomplete — a correctness problem as well as a performance one. Nothing tells the operator their history view is cut off.

### CI (RS-007)

`.github/workflows/ci.yml` runs on every push and pull request: install, unit and policy tests, type check and build, dependency audit, whitespace/conflict-marker check, and an enforced client bundle budget. It needs no production credentials, so a pull request can be verified without being handed secrets; the live smoke family talks to real data and stays manual.

`scripts/check-bundle-budget.mjs` measures the gzipped entry chunk — what a browser downloads for first paint — and excludes lazily loaded route chunks so the 012-B split is not penalised by its own success. Budgets: entry JS ≤ 150 kB, entry CSS ≤ 30 kB.

- First green run: all 9 steps pass, entry JS 96.3 kB / 150 kB, entry CSS 5.2 kB / 30 kB.

### Two defects CI found immediately

- **`vercel.json` was rejected.** I used `"//"` keys to document the caching rules, but `vercel.json` is schema-validated and refuses unknown properties, so the first deploy failed and production kept serving the old headers. Removed in `220bdc1`; the rationale lives here instead, in a file that can carry it.
- **The committed lockfile cannot produce a clean install on Linux.** `npm ci` failed in 11 seconds on every run: the lockfile resolves `@emnapi/*` 1.10.0 nested under a rolldown WASM binding, while Linux resolves 1.11.2 hoisted. The lockfile is platform-skewed, so `npm ci` was never reproducible across platforms — regenerating it on Windows changes nothing, because npm resolves optional platform dependencies per platform. CI now uses `npm install`, which is also what Vercel runs for this project, so the pipeline exercises the same resolution production gets. Restoring `npm ci` needs a lockfile regenerated on Linux.

### Regression

- `npm.cmd run smoke:live-audit` after the caching change: all 7 browser smokes passed.
- `npm.cmd test`: 217/217.

## Slice 012-B — reduced on evidence (2026-07-19)

The planned work was extracting pages from the 3,201-line `App.tsx` and adding `React.lazy` route chunks. Measurement showed the entry bundle is already **96.3 kB gzipped**, inside the audit's own ≤150 kB budget — the audit's 334 kB figure was uncompressed. On the owner's decision the refactor was dropped as a large, regression-prone change to the biggest file in the codebase, justified by a problem that does not exist. The enforced budget in CI is what keeps that decision honest: if the entry chunk ever grows past 150 kB, a pull request fails.

What was kept and verified — the parser isolation the plan asked to *preserve* rather than create:

- `mammoth`, `pdf-parse`, `read-excel-file` and `@napi-rs/canvas` are dynamically imported inside `api/_imports.js`, are statically imported nowhere in `src/`, `api/` or `server/`, and appear **zero times** in the built client bundle.
- `scripts/check-bundle-budget.mjs` now fails the build if any of them ever reach the client, so one stray static import cannot quietly add megabytes to first paint.

Not done: serverless function size and cold-start figures need Vercel dashboard access for the production project, which is under a different account than the one available here (see Phase 011 notes).

## Slice 012-C (part 1) — route-scoped reads (deployed 2026-07-19, commits `60b63c3`, `3535101`)

`GET /api/data/{summary,orders,audit,movements}`: dashboard counts computed in the database instead of by shipping every row to the browser and calling `.length` on it, plus keyset-paginated reads for the three high-growth collections.

- **Keyset, not OFFSET.** A cursor names the last row seen as `(created_at, id)` and every query orders by that same pair, so a row inserted or archived mid-pagination cannot shift the window and skip or duplicate a row.
- Page size is clamped (default 50, max 200), so a caller cannot ask for the whole table.
- A malformed cursor restarts from the beginning rather than erroring — it is a position hint, not a credential.
- One dynamic route serves all four resources, keeping the deployment clear of the function limit; the resource is validated against an allow-list and never interpolated into SQL.
- `api/_projection.js` is the single place deciding who may read what, and a test asserts it agrees with what `filterKitchenSnapshotForActor` withholds for every non-owner role, so the two paths cannot drift.

### Live verification: `npm run smoke:route-data` — **20/20 passed**

Highlights: unauthenticated read refused (401); summary is `private, no-store` + `Vary: Cookie`; a second page repeated **0 rows** and stayed strictly ordered across the boundary; `limit=100000` clamped to 200; malformed cursor returned 200; a temporary **Viewer got 403 on the audit trail** with no rows leaked, while still reading operational data — and bootstrap independently still withheld audit and staff rows from that same Viewer. The temporary Viewer is disabled in `finally`.

### The truncation finding, now quantified

The summary endpoint counts the real totals: **1458 audit rows and 962 inventory movements**. `/api/bootstrap` returns 100 and 200 of them. Operators have been seeing roughly **7% of the audit trail and 21% of stock movements**, with nothing in the UI indicating the view is cut off. This is a correctness defect that the performance work uncovered, and it is the strongest argument for finishing the migration off bootstrap.

Nothing has been removed from bootstrap yet: these endpoints are additive until every consumer moves and the per-role evidence is in, per the phase rollback plan.

### A deploy failure worth recording

Adding the endpoint took the deployment to 13 serverless functions, one over the limit, so the Vercel build failed and production kept serving the previous bundle. Every existing route still worked and only the new one 404d, which reads exactly like a routing bug rather than a failed deploy — `/api/orders/[orderId]/produced` returning 405 was what proved dynamic routes were fine and the deploy was not.

Root cause: `api/bootstrap.test.js` and `api/security-containment.test.js` are not underscore-prefixed, so Vercel had been deploying them as two live serverless functions all along. `.vercelignore` now excludes test files (plus `.planning`, `scripts`, `docs`) from the upload. The endpoint deployed 15 seconds after that fix.

## Remaining in Phase 012

- **012-C (part 2)**: migrate Dashboard, Orders, Audit Reports and ingredient history to the route-scoped endpoints with loading/empty/error/retry states and targeted invalidation, then remove the migrated collections from bootstrap and record the payload reduction. This is where the 448.9 kB actually falls.
- **012-C (part 3)**: move remaining `ALTER/CREATE/repair UPDATE` work off request paths into explicit idempotent migrations with a deploy preflight (RS-007).
- Lighthouse budgets and an authenticated performance job. A public login-page score is explicitly not evidence for the authenticated app, so this needs the controlled authenticated job to be worth anything.

## Residual Risk

- Risk: incremental bootstrap migration can cause cross-route stale references or role-data leaks.
  Owner: Phase 012; preserve fields until consumers and per-role tests pass.
- Risk: CI installs with `npm install` rather than a lockfile-exact `npm ci`, so a transitive dependency could drift between a passing CI run and a later build. Mitigated by the dependency audit step and by Vercel using the same command.
- Risk: immutable asset caching is only safe while filenames stay content-hashed. If the build is ever changed to emit unhashed asset names, this header becomes a stale-content bug.
