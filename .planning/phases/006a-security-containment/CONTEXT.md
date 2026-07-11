# Context

## Goal

Close the immediate security gaps discovered while reconciling the July 10 audit plan with commit `123643b`, before feature remediation begins.

## Relevant Files

- Path: `api/inventory-movements.js`
  Why it matters: deployed serverless POST mutates stock with no authentication, role check, active/revoked-session check, rate limit, or trusted actor attribution.
- Path: `server/index.js`
  Why it matters: the Express duplicate behaves differently and only checks token role, creating entry-point drift.
- Path: `api/_actions.js`
  Why it matters: `schema.ensure` bypasses permission, `ensureOperationalTables` runs before authorization, and audit attribution defaults to `system`.
- Path: `api/_auth.js`
  Why it matters: production signing can fall back to `DATABASE_URL` or a hard-coded development secret.
- Path: `api/_db.js`, `server/index.js`
  Why it matters: raw internal error messages are returned on 500 responses.

## Decisions

- Decision: One canonical inventory-adjustment implementation behind current DB-backed session validation and backend role checks.
  Reason: duplicated mutators already diverged; a public legacy route cannot remain as an alternate path.
- Decision: Authentication and authorization occur before schema maintenance; `schema.ensure` is Owner/Admin-only and cannot be called anonymously.
  Reason: rejected requests must not execute DDL or reconciliation writes.
- Decision: production requires a dedicated `SESSION_SECRET`; no production fallback to database credentials or a known constant.
  Reason: independent secret rotation and fail-closed configuration.
- Decision: internal error detail is logged server-side with a correlation id; clients receive stable safe messages.
  Reason: preserve diagnosability without exposing SQL/provider detail.

## Risks

- Risk: old smoke scripts or external clients may call the legacy movement route.
  Mitigation: retain a thin compatibility wrapper only if it delegates to canonical authorization/action logic; otherwise return 410 with migration guidance after confirming no tracked caller remains.
- Risk: requiring `SESSION_SECRET` can break a misconfigured deployment.
  Mitigation: add an explicit environment preflight and verify Vercel configuration before deploy; fail deployment/health clearly rather than silently weakening signing.
- Risk: moving DDL may expose un-applied schema drift.
  Mitigation: keep idempotent migration commands available to Owner/Admin/deployment tooling and document the deploy step; Phase 012 removes remaining hot-path DDL.
