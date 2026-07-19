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

## Remaining in Phase 012

- **012-B Client route chunks** — scope should be reconsidered given the bundle is already within budget. See the recommendation recorded in STATE.
- **012-C Route-scoped data and migrations** — now the highest-value work in the phase: `/api/dashboard/summary`, cursor-paginated orders/audit/movements behind one shared auth and role-projection layer, per-role response-shape tests, bootstrap shrink, and moving request-path DDL into explicit migrations (RS-007).
- Lighthouse budgets and an authenticated performance job are not yet added. A public login-page score is explicitly not evidence for the authenticated app, so this needs the controlled authenticated job to be worth anything.

## Residual Risk

- Risk: incremental bootstrap migration can cause cross-route stale references or role-data leaks.
  Owner: Phase 012; preserve fields until consumers and per-role tests pass.
- Risk: CI installs with `npm install` rather than a lockfile-exact `npm ci`, so a transitive dependency could drift between a passing CI run and a later build. Mitigated by the dependency audit step and by Vercel using the same command.
- Risk: immutable asset caching is only safe while filenames stay content-hashed. If the build is ever changed to emit unhashed asset names, this header becomes a stale-content bug.
