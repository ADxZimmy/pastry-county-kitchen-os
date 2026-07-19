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

### Not yet verified

Redeeming a genuinely emailed token end to end is NOT covered: it needs mailbox access or a preview database. Issuance, hashing, single-use redemption, expiry, and revoke-all are covered by unit tests; the live smoke covers everything reachable without consuming a real token. PCO-015 is closed for implementation, with this delivery round-trip recorded as outstanding external evidence rather than claimed.

## Remaining in Phase 011

- 011-B3: atomic Neon-backed rate limits for login/reset replacing the process-local Map (RS-006), then disable `AUTH_BEARER_COMPAT` and re-run the whole family cookie-only.
- Central `private, no-store` + `Vary` policy applied by a shared helper rather than per-handler (partially done: login, session, logout, bootstrap, actions, produced).

## Removal criteria for bearer compatibility

`AUTH_BEARER_COMPAT` may be switched off once: (1) the browser app is cookie-only — DONE at 011-B1; (2) every smoke authenticates by cookie for API calls as well as UI — browser seeding is done, the API calls still use bearer; (3) a full cookie-only run of the smoke family passes. It can be turned off in production without a deploy, and the code default flips in 011-B3.

## Residual Risk

- Risk: bearer compatibility remains accepted until 011-B3. It is time-boxed, flag-controlled, and cannot be exploited via CSRF because browsers never attach it automatically.
- Risk: no preview database exists, so browser-level cutover behaviour can only be verified against production immediately after deploy. Mitigated by the browser smoke family, which caught the connection leak within minutes.
- Risk: the reset timing floor (2.5s) swallows a normal mail-provider call, but a pathologically slow provider response could still overrun it and re-expose a small timing difference. Accepted; the alternative is not awaiting delivery, which serverless cannot do reliably without an extra dependency.
- Risk: reset request/confirm throttling still uses the process-local limiter, so it is per-instance until RS-006 lands in 011-B3.
- Risk: end-to-end proof that an emailed token can be redeemed remains outstanding (needs mailbox access or a preview database).
  Owner: Certification Evidence Closeout.
