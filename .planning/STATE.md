# State

Last updated: 2026-06-22

## Current Focus

Execute Phase 001 of the June 22 live-audit recovery, starting with authenticated bootstrap reads.

## Completed

- Synced local `main` with GitHub `origin/main` at `bb4fd77`.
- Read current progress docs: `docs/audit-milestone.md` and `docs/audit-handoff.md`.
- Read the June 22 live audit report from the provided Codex session `019eeee0-894f-7880-b3fa-4a7c002de3ab`.
- Initialized GSD Hybrid planning artifacts under `.planning/`.
- Implemented Phase 001 Step 1 locally: `/api/bootstrap` now requires a signed bearer session in both serverless and Express entry points, and the React app sends the saved session token only after login.
- Added bootstrap auth unit coverage for unauthenticated and authenticated reads.
- Pushed `13c5008` and verified the live deployment: unauthenticated `/api/bootstrap` returns 401, while authenticated owner login plus bootstrap returns 200.
- Reproduced the live decimal purchase failure with a temporary `AUDIT-Decimal` ingredient, then implemented local schema drift repair for decimal purchase/stock columns and user-safe purchase persistence errors.
- After the first decimal patch deployed, live fractional purchases returned the new user-safe message but still failed; removed an unnecessary SQL `case when unitCost > 0` comparison that could force integer parameter inference.
- Pushed `1bd7f3e` and verified live shopping purchases with unit costs `0.5`, `0.64`, `2.75`, and `10`; purchase logs, latest ingredient cost, inventory movements, and FEFO batches all persisted expected values, then cleanup archived the probe ingredient.
- Reproduced live conversion drift: Flour had two active verified `cup -> g` rules at `125g`; implemented conversion-rule reconciliation to restore audit values and archive duplicate active verified rules.
- Implemented natural conversion prompt parsing for questions such as `Convert 1 cup sugar to grams`, including flour, sugar, cocoa, egg, yolk, white, and coconut oil audit cases.
- Pushed `f08ebdf`, ran live `schema.ensure`, and verified production now has one active verified conversion rule for each audit ingredient with expected values: Flour `120g`, Sugar `200g`, Cocoa `85g`, Egg `50g`, Yolk `18g`, White `30g`, and Coconut Oil `240ml`.
- Confirmed production serves frontend bundle `assets/index-CokzK8DM.js`, matching the local build that passed natural AI conversion parsing tests.
- Used UI UX Pro Max guidance for the mobile/accessibility pass, then implemented Phase 001 Step 4: shopping purchase controls now use 44px hit targets, responsive tables render only the active desktop or mobile representation, and mobile table rows are constrained to prevent 320px overflow.
- Pushed `6c863ca`, `715df84`, and `ac3e4ce`; production now serves `assets/index-C2zAVjqJ.js` and `assets/index-BFPzob9P.css`.
- Verified live Shopping at 320, 360, 390, 414, and 430px: 14 purchase controls, minimum target `44x44`, unique purchase labels, mobile card representation only, and no horizontal overflow.

## In Progress

- Phase 001 Step 5: modal keyboard behavior.

## Blocked

- Item: Final production-ready claim.
  Reason: Live audit found public bootstrap data exposure, decimal purchase failure, conversion/AI regressions, mobile/a11y issues, and verification gaps.

## Next Action

Implement Phase 001 Step 5: add Escape close handling, focus return, and background inertness for modal surfaces.

## Verification Snapshot

- Command/check: `git pull --ff-only origin main`
  Result: Passed; fast-forwarded from `97cf912` to `bb4fd77`.
- Command/check: Audit comparison
  Result: Current repo marks Milestones 7 and 8 done, but June 22 live audit scored 72/100 and added a new recovery backlog.
- Command/check: `npm.cmd test`
  Result: Passed; 38 tests, including new bootstrap authentication coverage.
- Command/check: `npm.cmd run build`
  Result: Passed; TypeScript and Vite production build completed.
- Command/check: Live unauthenticated `GET /api/bootstrap`
  Result: Passed; production returned 401 with `Sign in again to continue.`.
- Command/check: Live authenticated login plus `GET /api/bootstrap`
  Result: Passed; owner login returned 200 and authenticated bootstrap returned 200 with recipes, ingredients, orders, and settings loaded.
- Command/check: Live decimal purchase reproduction
  Result: Failed as expected before the fix; production returned `invalid input syntax for type integer: "0.5"` for a temporary fractional shopping purchase, and cleanup archived the probe ingredient.
- Command/check: `npm.cmd test`
  Result: Passed; 40 tests, including fractional shopping-cost normalization and safe purchase-error mapping.
- Command/check: `npm.cmd run build`
  Result: Passed; TypeScript and Vite production build completed after the decimal purchase fix.
- Command/check: Live decimal purchase post-deploy probe
  Result: Partial; raw SQL error is no longer exposed, but `unitCost: 0.5` still failed with the user-safe purchase message before the SQL parameter-inference follow-up patch.
- Command/check: `npm.cmd test`
  Result: Passed; 40 tests after replacing the latest-cost SQL branch with direct decimal assignment.
- Command/check: `npm.cmd run build`
  Result: Passed; TypeScript and Vite production build completed after the SQL parameter-inference follow-up patch.
- Command/check: Live decimal purchase verification
  Result: Passed; production accepted `0.5`, `0.64`, `2.75`, and `10` unit costs, updated latest cost to `10`, created four purchase movements and four FEFO batches with total remaining quantity `4`, and cleanup archived the probe ingredient.
- Command/check: Live conversion snapshot
  Result: Drift reproduced; Flour had two active verified `cup -> g` rules and both were `125g`, while the audit expects a single active `120g` rule.
- Command/check: `npm.cmd test`
  Result: Passed; 42 tests, including natural conversion prompt parsing and AI response coverage for audit ingredients.
- Command/check: `npm.cmd run build`
  Result: Passed; TypeScript and Vite production build completed after the conversion/AI fix.
- Command/check: Live `schema.ensure` and conversion snapshot
  Result: Passed; production has canonical active verified conversion rules for the audit ingredient set and no duplicate active ingredient/from/to rules.
- Command/check: Live frontend bundle check
  Result: Passed; production serves `assets/index-CokzK8DM.js`, the same build artifact produced after the natural AI conversion parser tests passed.
- Command/check: `npm.cmd test`
  Result: Passed; 42 tests after the mobile shopping accessibility fix.
- Command/check: `npm.cmd run build`
  Result: Passed; TypeScript and Vite production build completed after the mobile shopping accessibility fix.
- Command/check: Live mobile Shopping viewport smoke
  Result: Passed; production served `assets/index-C2zAVjqJ.js` / `assets/index-BFPzob9P.css`, and Playwright verified widths 320/360/390/414/430 had unique purchase labels, 44x44 purchase checkbox targets, mobile cards only, and no horizontal overflow.
