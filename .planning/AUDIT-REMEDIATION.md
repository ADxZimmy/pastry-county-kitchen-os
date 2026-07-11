# July 10 Expanded Audit Remediation

## Source And Authority

- Audit: `Pastry_County_Kitchen_OS_Expanded_Audit_Report.md`
- Audit date: 2026-07-10
- Reviewed against repository commit: `123643b`
- Score: 54/100
- Launch status: Not Ready

This audit is the active release signal. The June 22 96/100 result remains regression history, but it does not override the deeper July 10 findings. A finding closes only after its acceptance behavior, automated checks, deployed smoke, and required manual UAT are recorded; a code diff alone is not closure.

## Release Gates

| Gate | Required scope | Exit evidence |
|---|---|---|
| S0 Security Containment | Phase 006a | Unauthenticated mutation and maintenance calls rejected; safe errors; dedicated production secret; security tests and controlled live probes pass |
| D1 Demo Trust | Phases 007-010 plus Phase 015-A | PCO-001..009, 014, 016 meet acceptance; core Prompt 10 create/edit/refresh/lifecycle UAT passes; no hard-coded operational or financial claims |
| M1 MVP Readiness | Phases 011-014 | PCO-010..015 hardening complete; cookie/CSRF/reset, performance/CI, accessibility evidence, and chosen AI outcome verified |
| R1 Audit Rerun | Phase 015-B | Full authenticated UAT, calculation/permission/security suites, production-safe smoke, cleanup, handoff, and fresh independent audit |

No unscripted operator or investor demo is approved before D1. No MVP release claim is approved before M1. No recovered score should be self-assigned; request a fresh external audit at R1.

## Finding Traceability

| Finding | Gate | Phase | Acceptance evidence |
|---|---|---|---|
| PCO-001 fabricated order history | D1 | 007 | Two orders show only their own persistent events, real timestamps/statuses/actors, and calculated shortage state |
| PCO-002 fixed 18,000 price | D1 | 007 | Server-canonical line/order totals drive every margin surface; 7,500/18,000/40,000 cases differ correctly |
| PCO-003 overstated assistant/cosmetic apply | D1/R1 | 010/014 | D1: honest Kitchen Helper plus real reviewed apply; R1: model-backed only if provider decision is approved and evidence passes |
| PCO-004 incorrect production periods | D1 | 008 | Africa/Lagos period-boundary tests and production smoke exclude terminal/out-of-period work |
| PCO-005 unsafe batch completion | D1 | 008 | Invalid transitions rejected server-side; completion locks rows, is atomic/idempotent, and requires QC confirmation |
| PCO-006 invalid yields | D1 | 009 | Client/server reject non-positive/non-finite base, target, item, and order-request quantities; scaling never emits NaN/Infinity |
| PCO-007 ineffective settings | D1 | 009 | Each supported setting changes a contract test and save/reload smoke; unsafe/obsolete settings are removed or renamed |
| PCO-008 decimal count inventory | D1 | 009 | Per-ingredient divisibility/minimum increment enforced consistently in forms, API, scaling, and shopping |
| PCO-009 unsafe cancellation | D1 | 008 | Confirmation explains consequences and captures reason; pre-production releases reservations; post-deduction cancellation is blocked or explicitly corrected |
| PCO-010 monolithic loading | M1 | 012 | High-growth datasets are paginated/route-scoped with role filtering and targeted invalidation; bootstrap measurably shrinks |
| PCO-011 asset revalidation | M1 | 012 | Production `/assets/*` returns one-year immutable caching; HTML remains short-lived |
| PCO-012 localStorage session/privacy | M1 | 011 | No session token readable by JS; HttpOnly cookie + CSRF protection; authenticated responses are private/no-store |
| PCO-013 accessibility gaps | M1 | 013 | AA contrast, semantic actions, legible nav, keyboard/screen-reader/mobile-keyboard evidence recorded |
| PCO-014 static smart guidance | D1 | 007 | Every suggestion shows data provenance and recommended date calculation, or the suggestion is removed |
| PCO-015 password recovery | M1 | 011 | Generic rate-limited request, hashed single-use expiring token, strength checks, session revocation, controlled delivery evidence |
| PCO-016 encoding artefacts | D1 | 007 | UTF-8 scan and production smoke show no mojibake |

## Repository Reconciliation Findings

These are current-source findings discovered while checking the pushed plan. They are not numbered findings from the external report, so they use `RS-*` identifiers.

| Finding | Priority | Owner phase | Required treatment |
|---|---|---|---|
| RS-001 unauthenticated `api/inventory-movements.js` stock mutation | Immediate | 006a | Retire it or delegate to the authenticated, DB-revalidated `inventory.adjust` action; never trust caller `createdBy` |
| RS-002 `schema.ensure` bypasses permission and actions run maintenance DDL before authorization | Immediate | 006a | Authenticate/authorize first; owner-only maintenance; migrate runtime DDL off hot paths later |
| RS-003 raw internal 500 messages returned by API/Express | Immediate | 006a | Log details server-side with correlation id; return stable user-safe messages |
| RS-004 session signing falls back to `DATABASE_URL` or a hard-coded development secret | Immediate | 006a | Require dedicated `SESSION_SECRET` in production and document it in `.env.example` |
| RS-005 generic audit/movement rows often attribute actions to `system` | Demo trust | 007 | Carry the authenticated actor through events, audit logs, QC, and movements; reserve `system` for automated jobs |
| RS-006 process-local, non-evicting rate-limit buckets | MVP security | 011 | Replace auth/reset throttling with an atomic shared store and retention cleanup |
| RS-007 no tracked CI/lint/coverage/performance workflow | MVP quality | 012/015 | Add a real CI workflow for test/build/audit and a separate controlled performance/live gate |

## Planning Corrections Made 2026-07-11

- Pulled security containment ahead of feature work without renumbering the already-pushed 007-015 phase identifiers.
- Added D1 authenticated UAT immediately after Phase 010; the original plan waited until all medium-priority work was complete despite the audit requiring UAT before any demo.
- Split broad phases into deployable slices with a green gate after each slice.
- Required server-canonical pricing rather than trusting client-computed totals.
- Required database locking and uniqueness-backed idempotency for production completion.
- Required a genuinely shared frontend/API policy module and explicit retirement of settings that cannot be safely honored.
- Distinguished saving a conversion rule from applying a converted value to a recipe.
- Added CSRF, hashed reset-token, distributed-throttling, and data-minimization requirements to the auth/AI plans.
- Removed the assumption that client parser packages inflate the Vite bundle; current document parsers are dynamically imported in the server-side import worker.
- Made AI provider selection an explicit decision gate instead of depending on an unavailable provider-specific skill.
