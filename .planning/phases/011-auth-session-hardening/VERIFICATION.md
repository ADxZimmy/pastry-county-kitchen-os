# Verification

## Slice 011-A — session, cookie, and CSRF foundation (deployed 2026-07-11, commit `e4fa6c3`)

Server-side only and deliberately invisible: the built bundle was byte-identical, so no user was logged out and the cookie machinery could be proven in production before anything depended on it.

- `npm.cmd test` — 180/180 (+35). `npm.cmd run build` — clean.
- `npm.cmd run smoke:auth-cookie` (new, `scripts/auth-cookie-smoke.mjs`) against production: **31/31 passed.**
  - Cookie is `__Host-pcko_session`, HttpOnly, Secure, SameSite=Lax, Path=/, no Domain.
  - Cookie alone authenticates; the response carries no credential in its body.
  - Cookie write refused without a CSRF token (403), with the wrong token (403), from a cross-site Origin even holding a valid token (403), and with no Origin at all (403); same-origin write with the session token succeeds (200).
  - Bootstrap and session responses are `private, no-store` with `Vary: Cookie`.
  - A tampered cookie is rejected; login rotates and kills the previous session; cross-site forced logout refused; logout revokes server-side so the cookie cannot be replayed.
- `npm.cmd run smoke:live-audit` after deploy: passed — existing bearer sessions unaffected.

### Rollout ordering (the hazard that was designed around)

During the migration window a browser holds BOTH credentials: the pre-011 bearer token in localStorage and the new cookie. Resolving the cookie first would have classified those requests as cookie-authenticated and demanded a CSRF header the shipped frontend did not send yet — every write would have returned 403. A valid bearer credential therefore wins while `AUTH_BEARER_COMPAT` is on. This costs nothing in CSRF terms: a forged cross-site request carries only the cookie and still lands on the enforced path.

## Slice 011-B1 — cookie-only browser sessions (deployed 2026-07-11, commits `e86b654`, `ca7241d`)

- No credential is readable from JavaScript. localStorage holds route and selection state only; identity comes from `GET /api/auth/session`.
- `readSession` actively deletes any `user` object persisted by an earlier build and writes the purge back, so returning browsers stop carrying the old bearer token on first load.
- All five API calls send cookie credentials and no Authorization header; writes carry `x-csrf-token`, held in memory for the tab.
- A stale CSRF token is recovered by re-fetching and retrying once, matched on the CSRF error text so a role denial is not silently retried.
- Logout reaches the server and revokes the session there.
- Protected routes render a loading screen until the server confirms the cookie, so a signed-in refresh no longer flashes the login page.
- `npm.cmd test` — 183/183 (+3 asserting browser storage holds no credential, including the legacy-token purge).

### Defect found and fixed by the gate

The first cutover build leaked a connection on every page load: `fetchSessionIdentity` read the response body only on success, so the common 401 (visitor with no cookie) left the body unconsumed and the request never completed. Logout ignored its response the same way. The app still worked — the 401 was handled and login rendered — so only a browser could catch it: `page.goto(..., networkidle)` hung for 30s on a request that never finished. Fixed in `ca7241d` by consuming the body before branching. Caught on the first smoke run after deploy, before it reached an operator.

### Smoke family migration

Six smokes signed themselves in by writing a user object into localStorage, which the cookie frontend purges — all six would have failed on this deploy, removing the regression gate exactly when it was needed. They now seed the real session cookie on the browser context through `scripts/_smoke-session.mjs`.

`scripts/phase2-rerun-smoke.mjs` asserted the opposite of what is now correct (it required a readable `user.token`). Inverted into a direct PCO-012 proof against a real browser: after a genuine UI login it asserts storage holds no credential, the session cookie exists, the cookie is HttpOnly, and `document.cookie` cannot see it.

- `npm.cmd run smoke:live-audit` (all 7 Playwright smokes) against the cookie frontend: **passed.**

### Known one-time effect

Anyone still holding a pre-011-A session had no cookie and was asked to sign in once. Sessions issued after 011-A carried the cookie and continued uninterrupted.

## Slice 011-B2 — real password recovery (deployed 2026-07-11, commits `3e51dca`, `f21e89c`)

The `Forgot password?` placeholder toast is replaced by a working flow at `#/reset` (request) and `#/reset/<token>` (confirm).

- Tokens are 32 random bytes stored only as SHA-256 hashes in `password_reset_tokens`, single-use, 30-minute expiry. Requesting a new link retires the previous outstanding ones.
- Redemption is the UPDATE itself — `used_at is null and expires_at > now()` sits in the WHERE clause — so two simultaneous redemptions cannot both succeed.
- Completing a reset revokes every session (the `session_revoked_at` stamp and the `app_sessions` rows) and deliberately issues no session: a reset proves control of the mailbox, not of the browser making the request.
- Password strength is validated before the token is spent, so a weak choice does not burn a valid single-use link. The rule lives in `shared/policy.js`, so browser and server cannot disagree.
- Reset links are built from configured origin or the deployment's own host, never from a caller-supplied header that could redirect a token elsewhere.
- `npm.cmd test` — 202/202 (+19). `npm.cmd run build` — clean.
- `npm.cmd run smoke:password-reset` against production: **16/16 passed** (never completes a reset, so no password changes).

### Honest delivery state

If the Resend sender is unconfigured — including the `resend.dev` sandbox, which cannot reach real inboxes — the request is refused with "Password reset by email is not set up yet. Ask your Kitchen OS administrator to set your password." Claiming a link was sent when none could be is precisely the class of UI dishonesty this remediation exists to remove. The check reads only server configuration, never the submitted address, so it reveals nothing about which accounts exist. Production was found to have delivery **configured** (the endpoint answers 200, not 503).

### Enumeration defect found and fixed by the gate

The first deploy padded responses to a 600ms floor, but a known address costs a lookup, a token insert, and a call out to Resend, while an unknown address costs one lookup. Measured live: 1420ms known vs a floor of 600ms — the padding covered only the cheap branch, leaving response time a usable oracle for whether an account exists. Raised to 2500ms in `f21e89c`; the gap fell from 1894ms to **307ms**, with both branches at ~3.1-3.4s. The smoke also warms the endpoint first, because a cold serverless start added seconds of noise unrelated to which branch ran.

### Regression check

`npm.cmd run smoke:live-audit` (all 7 Playwright smokes) after 011-B2: **passed**. Two earlier runs failed transiently and are recorded rather than hidden — the first hit a `networkidle` timeout on the login page while the `f21e89c` deploy was still propagating (the bundle was briefly not loading, so no session request fired and nothing rendered), and the second timed out on a click in `milestone7`, which passed on its own immediately afterwards. Neither reproduced on the clean run. The smoke family is somewhat sensitive to cold starts and deploy switchover; a failure should be re-run once before being treated as a regression.

### Not yet verified

Redeeming a genuinely emailed token end to end is NOT covered: it needs mailbox access or a preview database. Issuance, hashing, single-use redemption, expiry, and revoke-all are covered by unit tests; the live smoke covers everything reachable without consuming a real token. PCO-015 is closed for implementation, with this delivery round-trip recorded as outstanding external evidence rather than claimed.

## Slice 011-B3 — shared throttling and bearer retirement (deployed 2026-07-11, commits `5c149a6`, `66d3143`)

### RS-006 shared auth throttling

Login and password-reset throttling moved from a per-instance Map to a counter every serverless instance shares. One upsert creates the window, increments it, or starts a fresh one if the old window expired, so two instances racing on the same key cannot both read "1 attempt". Bucket keys are stored as keyed hashes, never the address and email in the clear; expired rows are swept opportunistically.

The in-memory limiter remains as a cheap first layer that short-circuits a repeat offender before the database is consulted. If the shared store is unreachable, the in-memory verdict stands and the fault is logged — a database blip degrades throttling rather than removing it or locking everyone out.

`/api/actions` deliberately keeps the per-instance limiter: it is coarse abuse control on an already-authenticated path, and a database round trip per action would tax the whole app. The credential checks are the boundary there.

- Live evidence: a **concurrent burst of 8 login attempts admitted exactly 5 and threw 429 at 3**, with a counting-down `Retry-After`. The concurrency is what makes this discriminating — serverless spreads simultaneous requests across instances, so a per-instance limiter would have let most of them through. This check is now permanent in `smoke:auth-cookie`.

### Bearer retirement

Cookies are the only credential the API accepts. Login no longer issues a bearer token. This is not tidiness: a bearer credential bypasses the same-origin and CSRF-token checks cookie requests are held to, so leaving it accepted would have left a permanent way around the protection this phase exists to add.

`AUTH_BEARER_COMPAT=on` survives as a rollback lever that re-opens the window without a deploy. It is documented as an unsupported mode, and a test pins that re-opening restores the old precedence, so the weakening is explicit rather than discovered later.

- `npm.cmd run smoke:auth-cookie`: **35/35** — including "login issues no bearer token" and "a bearer-only request is refused" (401).

### Smoke family migration (the ordering that mattered)

The harness had to move before the server. Once throttling is genuinely shared, seven children each signing in would trip the login limit on the suite's own legitimate traffic — the gate would have broken itself the moment the server changed, exactly as in 011-B1. The runner now signs in once and passes the session down through the environment; children reuse it and sign in only when run standalone. Phase 2 still drives the real login form, because that is what it exists to verify.

Every smoke authenticates by cookie plus CSRF token. This was verified against production **before** any server change, then again after.

### Cleanup defect found and fixed

A broken 015-A run (a stale `token` reference in the cleanup path) threw partway through cleanup and orphaned **9 records in production**. They were archived and verified gone. The cleanup now attempts each archive independently, so one failure cannot abandon the rest — the manifest safety contract depended on a code path that had no tolerance for its own failure.

### Final cookie-only verification

- `npm.cmd test` — **211/211**.
- `npm.cmd run smoke:live-audit` — all 7 Playwright smokes passed on one shared login.
- `npm.cmd run smoke:uat-core` — D1 gate **30/30**, clean cleanup (`archiveFailures: []`, `activeResidue: []`).
- `npm.cmd run smoke:password-reset` — **16/16**.
- `npm.cmd run smoke:auth-cookie` — **35/35**.

## Phase status

Phase 011 is COMPLETE. PCO-012 and PCO-015 are closed, and RS-006 is closed. Sessions are opaque, hashed, server-side, and cookie-only; mutations are CSRF-protected; password recovery is real; auth throttling is shared across instances.
- Central `private, no-store` + `Vary` policy applied by a shared helper rather than per-handler (partially done: login, session, logout, bootstrap, actions, produced).

## Removal criteria for bearer compatibility — all met

(1) The browser app is cookie-only — done at 011-B1. (2) Every smoke authenticates by cookie for API calls as well as UI — done at 011-B3. (3) A full cookie-only run of the smoke family passes — done, twice. The code default is now off.

## Residual Risk
- Risk: no preview database exists, so browser-level cutover behaviour can only be verified against production immediately after deploy. Mitigated by the browser smoke family, which caught the connection leak within minutes.
- Risk: the reset timing floor (2.5s) swallows a normal mail-provider call, but a pathologically slow provider response could still overrun it and re-expose a small timing difference. Accepted; the alternative is not awaiting delivery, which serverless cannot do reliably without an extra dependency.
- Risk: reset request/confirm throttling still uses the process-local limiter, so it is per-instance until RS-006 lands in 011-B3.
- Risk: end-to-end proof that an emailed token can be redeemed remains outstanding (needs mailbox access or a preview database).
  Owner: Certification Evidence Closeout.
