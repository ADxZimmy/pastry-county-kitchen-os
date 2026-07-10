# Plan

## Outcome

Sessions live in HttpOnly Secure cookies with rotation and revocation, no token is readable from JavaScript, every authenticated API response carries `Cache-Control: private, no-store`, and operators can recover accounts through rate-limited single-use expiring reset links. Audit findings PCO-012 and PCO-015 closed.

## Scope

Included:

- Cookie session issuance, validation, rotation, revocation; removal of localStorage token persistence.
- Private/no-store caching on all authenticated endpoints via a shared helper.
- Password reset request + confirm endpoints, email via Resend, strength validation, session revocation on reset.
- Migration of smoke scripts to cookie auth (temporary header fallback allowed during rollout only).

Excluded:

- External SPF/DKIM/DMARC DNS sign-off (tracked in Certification Evidence Closeout).
- Role model changes (roles already enforced server-side; Phase 015 adds automated permission tests).

## Steps

1. Add a session store table (or extend existing session records) with rotation metadata; issue the session id in an HttpOnly, Secure, SameSite=Lax cookie from api/auth/login.js.
2. Update api/_auth.js to authenticate from the cookie first, legacy bearer header second (flagged for removal); rotate session on login and privilege change; keep existing revoke flows working.
3. Remove localStorage session persistence from src/App.tsx (drop `pastry-county-session` writes; keep non-sensitive UI prefs like dismissed notifications); adjust bootstrap flow to rely on the cookie and a `/api/auth/me`-style check for initial load.
4. Add a shared response helper setting `Cache-Control: private, no-store` and apply it to bootstrap, actions, movements, auth, reports/exports, and imports handlers.
5. Implement `auth.requestReset` (generic response, rate-limited, single-use token with expiry, emailed via Resend) and `auth.confirmReset` (strength validation, revoke all sessions, rotate).
6. Replace the Forgot Password placeholder (App.tsx:1127) with the request form and a confirm/reset screen route.
7. Migrate scripts/*.mjs smokes to cookie-based auth; once green, remove the bearer fallback and re-run.
8. Tests: cookie attributes, rotation on login, revocation on reset, reset token single-use and expiry, generic response for unknown emails, no-store header presence on authenticated routes.
9. Verify headers in production (curl assertions in a smoke) and run the umbrella smoke.

## Verification

- Check: `npm.cmd test`
  Expected: Auth/session/reset tests pass.
- Check: Browser devtools after login
  Expected: No token in localStorage; session cookie is HttpOnly/Secure/SameSite=Lax.
- Check: curl authenticated endpoints
  Expected: `Cache-Control: private, no-store` present; unauthenticated bootstrap still 401.
- Check: Full reset flow against production (or staging if DNS pending)
  Expected: Link expires, is single-use, revokes sessions, enforces strength; unknown email gets identical response.
- Check: `npm.cmd run smoke:live-audit` with cookie-only auth
  Expected: Pass.

## Rollback

Keep the bearer-header code path behind a flag until cookie auth is verified in production; rollback = re-enable flag and revert frontend commit. Session table is additive.
