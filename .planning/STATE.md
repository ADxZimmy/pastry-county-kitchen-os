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

## In Progress

- Phase 001 Step 3: repair conversion rule correctness and AI conversion parsing.

## Blocked

- Item: Final production-ready claim.
  Reason: Live audit found public bootstrap data exposure, decimal purchase failure, conversion/AI regressions, mobile/a11y issues, and verification gaps.

## Next Action

Implement Phase 001 Step 3: reconcile live conversion rules, fix AI conversion parsing, add tests for audit prompts, and verify against production.

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
