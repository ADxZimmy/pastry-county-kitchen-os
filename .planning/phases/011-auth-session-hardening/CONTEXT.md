# Context

## Goal

Move sessions from localStorage bearer tokens to secure HttpOnly cookies, add private caching rules to authenticated responses, and implement real password recovery. Closes audit findings PCO-012 and PCO-015.

## Relevant Files

- Path: src/App.tsx:187,198,232
  Why it matters: Session token persisted in localStorage under `pastry-county-session`; any XSS can read it.
- Path: api/_auth.js, api/auth/login.js
  Why it matters: Token issuance/validation lives here; must set/read HttpOnly cookies and support rotation/revocation.
- Path: api/bootstrap.js, api/actions.js, api/inventory-movements.js and other authenticated handlers
  Why it matters: Need `Cache-Control: private, no-store` on every authenticated/user-specific response.
- Path: src/App.tsx:1127
  Why it matters: Forgot Password is a placeholder toast; owner lockout requires developer intervention.
- Path: api/_rateLimit.js
  Why it matters: Existing rate limiter should guard reset-request and reset-confirm endpoints.
- Path: package.json (resend dependency)
  Why it matters: Resend is already installed for email; reset links can ship without new dependencies, gated on RESEND env configuration.

## Decisions

- Decision: Use opaque random session tokens in an HttpOnly `__Host-` cookie in production, store only a token hash server-side, and rotate/revoke individual sessions on login, privilege change, logout, staff revocation, and password reset.
  Reason: Audit PCO-012; CSP reduces but does not eliminate XSS token theft.
- Decision: Pair cookie auth with SameSite protection, strict Origin/Referer validation, and a session-bound CSRF token/header on every mutating request.
  Reason: moving credentials into automatically sent cookies changes the threat model; the original plan omitted CSRF.
- Decision: Keep a feature-flagged, time-boxed bearer compatibility window for smoke migration only; remove it before Phase 011 closes.
  Reason: Avoid logging out all active operators at deploy moment; smoke scripts also authenticate via header today and need migration.
- Decision: Password reset tokens are high-entropy, single-use, short-lived, and stored only as hashes; requests use generic responses and shared-store throttling; successful reset revokes all sessions.
  Reason: Audit PCO-015 explicit requirements.
- Decision: Add `Cache-Control: private, no-store` centrally (shared response helper) rather than per-handler.
  Reason: New endpoints must inherit the rule automatically.
- Decision: Replace process-local auth/reset throttling with an atomic Neon-backed window table and retention cleanup unless a separately approved distributed service is selected.
  Reason: serverless instances do not share the current in-memory Map.

## Risks

- Risk: Smoke scripts and the import/AI flows authenticate with the localStorage token pattern.
  Mitigation: Update scripts/* to a cookie jar or keep header fallback until all smokes migrate; the phase is not done until smokes pass cookie-only.
- Risk: Email delivery (Resend domain/DNS) is part of the separately blocked certification evidence.
  Mitigation: Implement and test the reset flow with the configured sender; if DNS sign-off is pending, verify token issuance/redemption paths in staging and record the delivery dependency in VERIFICATION.md rather than claiming full closure.
- Risk: SameSite/cookie behavior differs between vercel.app production and local dev.
  Mitigation: Test matrix: local dev server, production domain, and the smoke harness.
- Risk: Compatibility bearer auth can become permanent accidentally.
  Mitigation: add a removal date/flag assertion and a test that Phase 011's final configuration rejects bearer-only requests.
