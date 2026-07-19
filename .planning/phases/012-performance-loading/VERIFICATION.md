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

## Slice 012-C (part 2) — audit trail migrated off bootstrap (deployed 2026-07-19, commit `b7cd122`)

The audit trail was the largest single item in the bootstrap payload and the worst-truncated: 110 kB, capped at 100 rows against a real total of 1,458. It now loads from `/api/data/audit`.

### Measured payload reduction

| | Before | After |
|---|---|---|
| `/api/bootstrap` transferred | 448.9 kB | **342.1 kB** |
| `auditLogs` in the payload | 100 rows / 110.4 kB | **removed** |

A 106.8 kB reduction, 23.8% of the payload, from one collection.

### Honesty, which was the bigger defect

The page now states how much of the trail is on screen. Verified in a real browser: **"Showing 50 of 1,485 audit entries"**, a "Load older entries" control, and an explicit caveat that search and filters only see loaded rows — so an empty filter result cannot imply the record itself is empty. Previously the UI presented 100 rows as the whole history with nothing indicating otherwise.

Ingredient pages fetch their own history through `entityType`/`entityId` rather than filtering a truncated copy of everything, so a record's history no longer depends on whether it happened to fall inside the last 100 global events.

### States this data never had

Designed against the skill's quality checklist (layout shift is High severity; errors must be announced, not colour-only):

- **Loading**: a skeleton that reserves the height the rows will occupy, so arriving data replaces it in place instead of shoving the page around. `role="status"`, `aria-busy`, with a visually-hidden "Loading…" for assistive tech.
- **Error**: `role="alert"` with a "Try again" control, rather than red text with no way forward.
- **Empty**: says what it means instead of leaving blank space.
- Reduced motion was already handled globally, so the skeleton pulse respects it.
- Requests carry a token, so a superseded response cannot overwrite newer data once a list can be reloaded and paged.

`filterKitchenSnapshotForActor` still blanks `auditLogs` even though the field is gone from the snapshot: if it ever returns to bootstrap it must not reach a lower role just because the line was tidied away.

### Verification

- `npm.cmd test` — 234/234. Build clean.
- `npm.cmd run smoke:route-data` — 20/20 against production.
- `npm.cmd run smoke:live-audit` — all 7 browser smokes passed.
- Browser check of the migrated page: honest count, load-more control, and filter caveat all render.

## Slice 012-C (part 2, continued) — lots and movements (deployed 2026-07-19, commits `3e5466b`, `496a238`, `b00a019`)

### Cumulative payload reduction

| Collection | Before | After |
|---|---|---|
| `auditLogs` | 110.4 kB (100 of 1,458) | removed |
| `inventoryMovements` | 65.4 kB (200 of 962) | **15.2 kB** (49 live-order reservations) |
| `ingredientBatches` | 50.5 kB (181 rows) | **17.0 kB** (60 soonest-expiring) |
| **`/api/bootstrap` total** | **448.9 kB** | **259.6 kB** |

**189.3 kB removed — 42% of the payload.**

### Neither collection could simply be dropped

`ingredientBatches` feeds expiry notifications and the Next FEFO Lots report, both computed synchronously. `inventoryMovements` is read by `cancellationConsequences` and `reservationQuantityForOrder` to resolve a live order's reservations — dropping it would have made the cancel modal stop reporting that a reservation gets released, under-reporting a real consequence, which is the exact dishonesty PCO-009 fixed.

So both were **narrowed to what cross-cutting logic actually reads**, not emptied:

- lots → the 60 soonest-expiring, which is precisely what the expiry notification and FEFO report want;
- movements → reservation and reservation_release rows for non-archived orders, which is precisely what the cancellation logic wants.

Everything else moved to `/api/data/*`, and each consumer ended up **more** correct than before:

- Ingredient pages fetch their own movements and lots, so a record's history no longer depends on whether it fell inside a global cap.
- The waste report asks for waste movements instead of filtering a truncated copy of every movement type.
- Dashboard "Waste Events" and "Most used ingredient" are aggregated by the database over every row. They were computed from whatever fitted in the last 200 movements, so "most used" actually meant "most used recently" and changed meaning silently as history grew. Both show a placeholder if the aggregate cannot be fetched, rather than a wrong number.

### A regression the smoke caught, and why the fix was not test-fudging

`smoke:regression-audit` failed with "No FEFO batch was returned". The failure was correct: it asserted FEFO behaviour by finding its test ingredient's lot in the bootstrap snapshot, and a freshly created lot with no expiry date sorts last under `expiry_date nulls last`, so it never made the 60-row cut.

The assertion is still worth making, so it now reads the lot from `/api/data/batches?ingredientId=`, which is complete — and which is also the source the ingredient page itself uses. The smoke now checks the same path an operator sees, rather than one that only ever worked for ingredients that happened to fall inside a global slice. Verified first that no remaining app code reads per-ingredient lots from the snapshot; the two survivors are both expiry-filtered.

### Verification

- `npm.cmd test` — 234/234. Build clean.
- `npm.cmd run smoke:route-data` — 20/20.
- `npm.cmd run smoke:live-audit` — all 7 browser smokes passed.
- `npm.cmd run smoke:uat-core` — D1 Demo Trust Gate still **30/30**, so none of this regressed the demo-trust behaviour.

## Slice 012-C (part 3) — schema changes off request paths (deployed 2026-07-19, commit `3c6f9be`)

### What was running on ordinary requests

Roughly **a hundred `ALTER`/`CREATE` statements**: about 40 on every bootstrap, more on every action, two on every login — plus a repair `UPDATE` on `ingredients` inside the snapshot loader, so a **read wrote to the database**.

It was idempotent, so it worked. But reads did schema work, and any authenticated request could change the schema — the thing Phase 006a began closing when it stopped anonymous callers reaching DDL.

### What replaced it

`scripts/migrate.mjs` is now the only place schema changes happen. The steps are the same idempotent functions, **moved rather than rewritten**, so this is a relocation and not a redefinition of the schema:

| Step | Source |
|---|---|
| `001-core-snapshot-schema` | extracted from `loadKitchenSnapshot` into `ensureSnapshotSchema` |
| `002-operational-tables` | `ensureOperationalTables` |
| `003-session-columns` | `ensureSessionColumns` |
| `004-app-sessions` | `ensureSessionTables` |
| `005-password-reset-tokens` | `ensurePasswordResetTable` |
| `006-auth-rate-limits` | `ensureRateLimitTable` |

Applied steps are recorded in `schema_migrations`. `npm run db:migrate -- --check` reports status and changes nothing — that is the deploy preflight.

### Measured effect

| | Before Phase 012 | After |
|---|---|---|
| `/api/bootstrap` payload | 448.9 kB | **261.4 kB** |
| `/api/bootstrap` warm time | ~1175–1476 ms | **643–774 ms** |

Roughly **45% faster and 42% smaller**, from removing work that was never needed on a read.

### Why this was safe to deploy in this order

Every statement removed had already run in production — it executed on every request for the whole programme. The newest tables (`app_sessions`, `password_reset_tokens`, `auth_rate_limits`) were confirmed present by passing smokes immediately before deploying. Removing the statements therefore could not leave the schema behind.

Not done: `npm run db:migrate` has not been run against production, because `DATABASE_URL` for the production database is not available in this environment. It is a no-op there — every step is already applied — but the `schema_migrations` bookkeeping table does not exist yet, so the first owner-run will record all six steps at once. Nothing gates on that table, so this is bookkeeping, not a functional gap.

One deliberate exception: the shared rate limiter still creates its table on a missing-relation error. That is a recovery path rather than an ordinary request, and failing closed there would take out login throttling.

### Verification

- `npm.cmd test` — 234/234. Build clean.
- `npm.cmd run smoke:live-audit` — all 7 browser smokes passed.
- `npm.cmd run smoke:route-data` — 20/20.
- `npm.cmd run smoke:auth-cookie` — 35/35.
- `npm.cmd run smoke:password-reset` — passed.
- `npm.cmd run smoke:uat-core` — D1 Demo Trust Gate still **30/30**.

## Remaining in Phase 012

- `recipeItems` is now the largest item at 108.7 kB and 266 rows. It is **not** growth-capped, so pagination is the wrong tool — it needs per-recipe loading, a different change from the three collections handled so far.
- Dashboard and Orders could still move onto `/api/data/summary` and `/api/data/orders`; the endpoints exist and are verified, but the current snapshot-driven versions are correct and bounded, so this is optimisation rather than defect repair.
- Lighthouse budgets and an authenticated performance job. A public login-page score is explicitly not evidence for the authenticated app, so this needs the controlled authenticated job to be worth anything.
- Owner action: run `npm run db:migrate` once against production to record the schema baseline.

## Residual Risk

- Risk: incremental bootstrap migration can cause cross-route stale references or role-data leaks.
  Owner: Phase 012; preserve fields until consumers and per-role tests pass.
- Risk: CI installs with `npm install` rather than a lockfile-exact `npm ci`, so a transitive dependency could drift between a passing CI run and a later build. Mitigated by the dependency audit step and by Vercel using the same command.
- Risk: immutable asset caching is only safe while filenames stay content-hashed. If the build is ever changed to emit unhashed asset names, this header becomes a stale-content bug.
