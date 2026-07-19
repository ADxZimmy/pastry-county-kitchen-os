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

## Remaining in Phase 011

- 011-B2: password reset (generic responses, high-entropy hashed single-use expiring tokens, revoke-all on success, Resend delivery from an allow-listed origin) and the `Forgot password?` UI, replacing the placeholder toast (PCO-015).
- 011-B3: atomic Neon-backed rate limits for login/reset replacing the process-local Map (RS-006), then disable `AUTH_BEARER_COMPAT` and re-run the whole family cookie-only.
- Central `private, no-store` + `Vary` policy applied by a shared helper rather than per-handler (partially done: login, session, logout, bootstrap, actions, produced).

## Removal criteria for bearer compatibility

`AUTH_BEARER_COMPAT` may be switched off once: (1) the browser app is cookie-only — DONE at 011-B1; (2) every smoke authenticates by cookie for API calls as well as UI — browser seeding is done, the API calls still use bearer; (3) a full cookie-only run of the smoke family passes. It can be turned off in production without a deploy, and the code default flips in 011-B3.

## Residual Risk

- Risk: bearer compatibility remains accepted until 011-B3. It is time-boxed, flag-controlled, and cannot be exploited via CSRF because browsers never attach it automatically.
- Risk: no preview database exists, so browser-level cutover behaviour can only be verified against production immediately after deploy. Mitigated by the browser smoke family, which caught the connection leak within minutes.
- Risk: password recovery is still a placeholder; owner lockout needs developer intervention until 011-B2 (PCO-015 open).
- Risk: email DNS/domain verification may block end-to-end delivery proof for 011-B2.
  Owner: Certification Evidence Closeout; token lifecycle still requires isolated verification.
