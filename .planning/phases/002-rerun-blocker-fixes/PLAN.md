# Plan

## Outcome

The June 22 rerun blockers are fixed and proven locally and against production: revoked sessions cannot bootstrap data, fresh UI login establishes a usable session, AI conversion prompts use verified rules, Production has no 320px horizontal overflow, and mobile structural accessibility issues are removed.

## Scope

Included:

- DB-backed bootstrap session validation for active, disabled, and revoked users.
- Role-filtered bootstrap snapshots for low-privilege users where sensitive admin data is unnecessary.
- Fresh login persistence and initial bootstrap sequencing.
- Natural AI conversion prompt parsing for the exact rerun audit prompts, including trailing punctuation.
- Production page 320px overflow repair.
- Mobile table/card semantic markup and Production heading hierarchy repair.
- Repeatable local and live verification for the rerun findings.
- Audit milestone, handoff, and GSD state updates.

Excluded:

- Large role/permission redesign beyond snapshot filtering and existing mutation permissions.
- Full visual redesign of Production, Shopping, or Dashboard.
- Sending real low-stock email during automated verification.
- Adding new UI frameworks.

## Steps

1. Step: Reproduce and pin the rerun blockers.
   - Add failing tests for disabled/revoked bootstrap access using a signed token issued before `session_revoked_at`.
   - Add a bootstrap role-filter test for Viewer to prove sensitive keys are absent or redacted.
   - Add a React/localStorage login test or Playwright smoke that starts from empty storage, submits the login form, and asserts `pastry-county-session.user.token` exists before dashboard bootstrap.
   - Add exact AI prompt tests with punctuation:
     - `Convert 4 cups flour to grams.`
     - `Convert 1 cup sugar to grams.`
     - `Convert 1 cup cocoa powder to grams.`
     - `Convert 4 large eggs to grams.`
     - `Convert 1 cup coconut oil to ml.`
   - Add a 320px Production overflow check and semantic mobile-card/heading-order assertions to the smoke suite.

2. Step: Fix bootstrap session validation and snapshot filtering.
   - Extract or share a DB-backed session validator from the mutation path so `/api/bootstrap` checks `app_users.active` and `session_revoked_at`.
   - Use the same validator in serverless `api/bootstrap.js` and Express `server/index.js`.
   - Keep Owner/Admin bootstrap unchanged.
   - For lower roles, return stable snapshot keys but remove or redact sensitive admin-only data such as `appUsers`, `auditLogs`, session revocation fields, and private settings not needed by the role.
   - Preserve user-safe 401 messages for missing, disabled, or revoked sessions.

3. Step: Fix fresh UI login session establishment.
   - Add a single session persistence helper in `src/App.tsx` for `page`, selected ids, and `user`.
   - On login success, write the returned user/token synchronously before setting page/dashboard state.
   - Allow `loadKitchenData` to accept a token override or session object so the first bootstrap after login does not reread stale localStorage.
   - Ensure logout clears the user/token path and leaves public welcome/login routes usable.

4. Step: Fix AI natural conversion prompts in the chat path.
   - Split natural conversion parsing into a focused helper before recipe-line parsing.
   - Support optional words and punctuation: `large eggs`, plural units, trailing periods, `grams`, `millilitres`, `ml`.
   - Prefer verified ingredient-specific conversion rules over direct same-unit fallback when the prompt asks for a target unit.
   - Make `buildKitchenAssistantResponse` format conversion answers distinctly, for example `Sugar: 1 cup -> 200g (High)`, and never return `1 g -> 1g` for audit prompts.

5. Step: Fix Production 320px overflow.
   - Inspect production cards/actions at 320x568 and identify the element causing `htmlOverflow`/`bodyOverflow`.
   - Constrain `.ai-card`, `.item-card`, `.button-row`, and production action groups with `min-width: 0`, `max-width: 100%`, wrapping, and small-screen grid rules where needed.
   - Keep action targets at least 44px tall and preserve desktop density outside the small breakpoint.

6. Step: Fix mobile structural accessibility issues.
   - Replace generic mobile table `role="list"` / `role="listitem"` on `article` cards with semantic `ul` / `li` markup or valid role ownership.
   - Repair Production heading order so the page has one sensible `h1`, section headings progress predictably, and card headings do not skip levels.
   - Add smoke checks for Shopping mobile card semantics and Production heading order across mobile widths.

7. Step: Verify locally.
   - Run `npm.cmd test`.
   - Run `npm.cmd run build`.
   - Run any targeted Playwright smoke additions against the live deployment only when credentials are available from `.env.local`.
   - Run `git diff --check` before committing.

8. Step: Verify production and update handoff.
   - Push each local change after completion.
   - Wait for the live deployment to serve the new bundle/API behavior.
   - Run targeted live checks:
     - missing bootstrap token returns 401
     - revoked token bootstrap returns 401
     - Viewer bootstrap is filtered
     - fresh browser login reaches dashboard with stored user/token
     - AI chat audit prompts return expected conversions
     - Production has no 320px overflow
     - mobile structural checks pass
   - Run `npm.cmd run smoke:live-audit`.
   - Update `docs/audit-handoff.md` with the new baseline and retest list.

## Verification

- Check: `npm.cmd test`
  Expected: all unit/API tests pass, including revoked bootstrap, role-filtered bootstrap, login persistence, AI conversion prompt, heading/order, and overflow helper coverage where practical.

- Check: `npm.cmd run build`
  Expected: TypeScript and Vite production build pass.

- Check: targeted live auth smoke
  Expected: unauthenticated bootstrap returns 401, revoked pre-existing token returns 401, disabled user login returns 401, and Viewer bootstrap omits sensitive admin data.

- Check: targeted live login smoke
  Expected: empty browser storage plus normal login reaches Dashboard without `Session expired`, and localStorage contains `pastry-county-session.user.token`.

- Check: targeted live AI smoke
  Expected: audit prompts return `480g`, `200g`, `85g`, `200g`, and `240ml` respectively, with no `1 g -> 1g` fallback.

- Check: targeted mobile smoke at 320/360/390/414/430px
  Expected: Production, Shopping, Inventory, Dashboard, and Settings have no horizontal overflow; Production specifically passes at 320x568.

- Check: mobile structural accessibility smoke
  Expected: mobile table cards use valid list semantics and Production heading order is valid.

- Check: `npm.cmd run smoke:live-audit`
  Expected: full live audit smoke passes and cleanup leaves no active temporary audit records.

## Rollback

Revert the Phase 002 commits if DB-backed bootstrap blocks valid Owner/Admin sessions or snapshot filtering breaks critical app loading. Keep role filtering stable-key based so rollback can be a small change to filtering rather than a schema rollback.
