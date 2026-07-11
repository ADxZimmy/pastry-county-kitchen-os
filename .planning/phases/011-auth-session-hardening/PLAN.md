# Plan

## Outcome

No session credential is readable from JavaScript. Production uses opaque, hashed server-side sessions in an HttpOnly Secure cookie with CSRF protection, rotation, logout, and revocation. Authenticated responses are private/no-store. Password recovery uses generic, shared-rate-limited requests and hashed single-use expiring tokens. PCO-012, PCO-015, and RS-006 close at the MVP gate; Phase 006a security containment remains a prerequisite.

## Scope

Included:

- Server-side session and password-reset records with hashed tokens.
- Production `__Host-` cookie attributes and explicit local-development behavior.
- CSRF token plus Origin/Referer enforcement for mutating requests.
- Login/privilege/logout/reset rotation and revocation.
- Central private/no-store response policy.
- Atomic shared-store throttling for login/reset and cleanup.
- Reset request/confirm UI and controlled Resend delivery.
- Cookie-aware smoke harness; removal of bearer compatibility before closure.

Excluded:

- External SPF/DKIM/DMARC certification sign-off.
- Role redesign; Phase 015 verifies the existing role matrix.

## Delivery Slices

### 011-A Session And CSRF Foundation

1. Add idempotent migrations for `app_sessions`, CSRF/session metadata as needed, and an atomic `auth_rate_limits` store. Store SHA-256 or stronger hashes of random opaque tokens, never raw tokens.
2. Issue a production cookie such as `__Host-pcko_session` with HttpOnly, Secure, SameSite=Lax, Path=/, short expiry, and no Domain. Define a separate non-Secure localhost-only development cookie; never weaken production based on request headers.
3. Authenticate cookie first. Add `/api/auth/session` (current user + CSRF token, no credential) and `/api/auth/logout`. Rotate on login and privilege change; revoke individual/all sessions through existing staff controls.
4. Require allowed Origin/Referer and a session-bound CSRF header for every mutating cookie-auth request. Add same-origin tests, missing/invalid token tests, and explicit exceptions only for safe methods.
5. Keep bearer support behind a temporary migration flag while smokes move; record removal criteria and make final Phase 011 tests run with the flag disabled.

### 011-B Privacy And Recovery

6. Remove token fields and token-bearing session objects from localStorage. Keep only non-sensitive UI preferences/route state. Initial app load calls the session endpoint then bootstrap with cookie credentials.
7. Centralize `Cache-Control: private, no-store` and appropriate `Vary` headers for login, session, bootstrap, actions, imports, reports/exports, reset, and other user-specific endpoints; verify 401s do not leak cached private data.
8. Implement atomic Neon-backed rate limits for login/reset with hashed identities, bounded retention, and cleanup. Keep in-memory limits only as an optional first layer, not the security boundary.
9. Implement reset request: generic response, normalized email, high-entropy token, hashed storage, expiry, single-use marker, neutral audit event, and Resend link built from an allow-listed public app origin.
10. Implement reset confirm: constant-time hash comparison, strong password validation, bcrypt update, consume token, revoke all sessions, and issue no automatic privileged session unless explicitly designed/tested.
11. Replace Forgot Password placeholder with request and reset routes, including expired/used/error states that do not enumerate accounts.
12. Migrate all smokes to a cookie jar + CSRF flow, disable bearer compatibility, and run production header/session/reset tests. If email DNS remains pending, verify token lifecycle in an isolated preview and record delivery as external—not complete—evidence.

## Verification

- Check: browser storage/cookies after login
  Expected: no credential in localStorage/sessionStorage; production cookie is HttpOnly, Secure, SameSite=Lax, Path=/, no Domain.
- Check: mutating request without valid Origin/CSRF token
  Expected: 403 before business SQL; same-origin valid request succeeds according to role.
- Check: login, privilege change, logout, staff revoke, password reset
  Expected: expected sessions rotate/revoke and stale cookies fail immediately.
- Check: reset token database values and replay
  Expected: only hashes stored; first valid use succeeds; replay/expired/unknown token fails generically; unknown-email request is indistinguishable.
- Check: authenticated and user-specific responses
  Expected: `Cache-Control: private, no-store` and correct `Vary`; no private response served cross-user.
- Check: `npm.cmd test`, `npm.cmd run build`, cookie-only smoke family
  Expected: pass with bearer compatibility disabled.

## Rollback

Use a short-lived compatibility flag only during rollout. Do not roll back to localStorage token persistence after cookie auth is verified. If production cookie behavior fails, disable mutations and restore the previously secured Phase 006a bearer path temporarily while correcting cookie/CSRF configuration.
