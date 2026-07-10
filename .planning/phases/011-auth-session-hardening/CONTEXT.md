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

- Decision: Cookie-based sessions: HttpOnly, Secure, SameSite=Lax, short lifetime with server-side session records enabling rotation (on login/privilege change) and revocation (existing staff revoke flows, password reset).
  Reason: Audit PCO-012; CSP reduces but does not eliminate XSS token theft.
- Decision: Keep a one-release compatibility window where the API accepts the legacy bearer header as fallback, then remove it.
  Reason: Avoid logging out all active operators at deploy moment; smoke scripts also authenticate via header today and need migration.
- Decision: Password reset: single-use expiring tokens, generic "if the account exists" responses, rate limiting, password-strength validation, revoke all sessions after reset.
  Reason: Audit PCO-015 explicit requirements.
- Decision: Add `Cache-Control: private, no-store` centrally (shared response helper) rather than per-handler.
  Reason: New endpoints must inherit the rule automatically.

## Risks

- Risk: Smoke scripts and the import/AI flows authenticate with the localStorage token pattern.
  Mitigation: Update scripts/* to a cookie jar or keep header fallback until all smokes migrate; the phase is not done until smokes pass cookie-only.
- Risk: Email delivery (Resend domain/DNS) is part of the separately blocked certification evidence.
  Mitigation: Implement and test the reset flow with the configured sender; if DNS sign-off is pending, verify token issuance/redemption paths in staging and record the delivery dependency in VERIFICATION.md rather than claiming full closure.
- Risk: SameSite/cookie behavior differs between vercel.app production and local dev.
  Mitigation: Test matrix: local dev server, production domain, and the smoke harness.
