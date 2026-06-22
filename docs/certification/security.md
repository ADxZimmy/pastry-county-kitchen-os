# Security Certification Gate

Standard: OWASP ASVS 5.0.0 readiness coverage for this MVP production surface.

## Automated Checks

- `/api/health` returns healthy production status.
- Unauthenticated `/api/bootstrap` returns 401 and no private snapshot.
- Unauthenticated `/api/actions` returns 401.
- Malformed bearer token returns 401.
- Bad login returns 401 without a token.
- Repeated bad login attempts are rate limited.
- Repeated unauthenticated mutation attempts are rate limited.
- Owner login returns a signed bearer token.
- Owner bootstrap omits password hashes.
- Viewer bootstrap omits populated `appUsers` and `auditLogs`.
- Viewer mutation attempts return 403.
- Revoked Viewer token cannot call `/api/bootstrap`.
- Disabled Viewer cannot log in.
- Security headers are deployed: CSP, X-Frame-Options or frame-ancestors, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, HSTS.
- `npm audit --audit-level=high` has no high or critical vulnerabilities.
- Tracked-source scan finds no committed production secrets.

## Manual Sign-Off

- Confirm production `SESSION_SECRET`, `DATABASE_URL`, `RESEND_API_KEY`, and deployment tokens are managed in Vercel/environment storage, not in git.
- Confirm rate limiting or upstream abuse protection is enabled for login and mutation APIs.
- Confirm database access is least-privilege for the app runtime.
- Confirm a human reviewed the role matrix against expected bakery staff duties.

## Blocking Criteria

Any Critical/High vulnerability, private-data exposure, stale-token access, missing production security headers, committed secret, or role bypass blocks 100/100.
