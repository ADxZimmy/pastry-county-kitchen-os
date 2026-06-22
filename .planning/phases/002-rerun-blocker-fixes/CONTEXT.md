# Context

## Goal

Close the June 22 external audit rerun blockers and move the live app from 76/100 toward a 95+ production-readiness candidate.

## Audit Source

- Session: `019eeee0-894f-7880-b3fa-4a7c002de3ab`
- Report: `C:\Users\PC\Documents\Codex\2026-06-22\files-mentioned-by-the-user-pasted\outputs\pastry-county-kitchen-os-rerun-audit-2026-06-22.md`
- Result: `76/100 - not ready for 95+ release`

## Blockers

- Critical: revoked Viewer tokens can still call authenticated `/api/bootstrap` and receive the kitchen snapshot.
- High: fresh browser login succeeds at `/api/auth/login` but does not persist a usable `user.token`, then shows `Session expired`.
- High: natural AI chat conversion prompts still produce `1 g -> 1g` style answers in production.
- Medium: Production still overflows horizontally at 320px.
- Medium: mobile Axe still flags `aria-allowed-role` on mobile cards and heading-order issues on Production.

## Relevant Files

- Path: `api/bootstrap.js`
  Why it matters: Bootstrap currently checks only token shape through `actorFromRequest`; it does not perform the DB-backed active/revoked-session validation used by mutations.

- Path: `api/_actions.js`
  Why it matters: `sessionAccessError` and `requirePermission` already show the DB-backed session validation behavior that bootstrap should share.

- Path: `api/_auth.js`
  Why it matters: Signed token creation and parsing live here; Phase 002 should avoid duplicating token logic.

- Path: `api/_db.js`
  Why it matters: `loadKitchenSnapshot()` returns staff, suppliers, movements, batches, audit logs, conversion rules, and settings; low-privilege filtering should happen around this boundary.

- Path: `server/index.js`
  Why it matters: Local Express `/api/bootstrap` must match serverless behavior.

- Path: `src/App.tsx`
  Why it matters: Login persistence, bootstrap loading, AI page, Production page, mobile table card markup, and modal/page structure live here.

- Path: `src/lib/kitchen.ts`
  Why it matters: `buildKitchenAssistantResponse`, `parseRecipeText`, and conversion lookup logic live here.

- Path: `src/styles.css`
  Why it matters: The 320px Production overflow is likely caused by production card/action layout constraints and wrapping.

- Path: `scripts/live-audit-smoke.mjs`, `scripts/regression-audit-smoke.mjs`, `scripts/milestone7-smoke.mjs`
  Why it matters: These should gain rerun-blocker coverage before asking for another external audit.

## Decisions

- Decision: Treat the 76/100 rerun as a new Phase 002 rather than reopening Phase 001.
  Reason: Phase 001 fixed the original 72/100 findings, but the rerun surfaced new security/session and UI issues.

- Decision: Fix DB-backed bootstrap session validation before UI or AI work.
  Reason: Revoked-token snapshot access is the only Critical finding and blocks any real production claim.

- Decision: Keep low-privilege bootstrap behavior intentionally filtered.
  Reason: Viewer/Baker-style roles may need read-only app access, but they do not need staff management records, audit logs, session revocation timestamps, or other private administrative data.

- Decision: Use UI UX Pro Max guidance for mobile work.
  Reason: The remaining UI work is operational-dashboard polish: dense but scannable layout, valid semantic structure, 44px targets, visible focus, and no 320px overflow.

## Risks

- Risk: Tightening bootstrap can break legitimate signed-in users if the app fetches before localStorage is updated.
  Mitigation: Pair the API fix with synchronous login persistence and token override support in `loadKitchenData`.

- Risk: Role-filtered snapshots can break screens that assume arrays always contain full data.
  Mitigation: Return stable keys with empty or redacted arrays where needed, and add role-specific bootstrap tests.

- Risk: AI conversion may pass unit tests but fail in production due to punctuation, wording, or stale bundle deployment.
  Mitigation: Add exact audit prompts with periods to tests and live Playwright chat smoke, then verify the deployed bundle.

- Risk: Mobile layout fixes can regress desktop density.
  Mitigation: Scope CSS to small breakpoints and Production/mobile table surfaces; verify 320px and desktop build smoke.
