# Plan

## Outcome

A reproducible `smoke:uat-full` run against production passes the audit's Prompt 10 script end to end, calculation and permission regression suites are permanent, audit handoff docs reflect the remediated product, and a fresh external audit rerun is requested against the new baseline.

## Scope

Included:

- Full authenticated UAT script per audit Prompt 10 (isolated test workspace, ten inventory records, Brownies recipe, scaling cases, order lifecycles, refresh-after-every-write, before/after value capture, cleanup).
- Consolidated calculation regression suite (scaling 16->12/8/24 + tiny/decimal/packaging cases, costing with real ingredient prices, margin from persisted order totals, every rounding policy).
- Role/permission matrix tests: each mutating API action against each role, expecting server-side rejection where unauthorized.
- Refresh of docs/audit-handoff.md and docs/audit-milestone.md around the July 10 baseline and remediation evidence.
- Final green run of the entire smoke family before requesting the external rerun.

Excluded:

- Certification evidence closeout items (separate roadmap entry).
- Any new product features.

## Steps

1. Build `scripts/uat-full-smoke.mjs`: create the ten specified inventory records, the 16-piece Brownies recipe, verify the three scaling cases numerically, create the 12-piece order and the mixed 8-piece + two-loaf order with real selling prices.
2. Drive lifecycles: confirmation, reservation, production start, QC, completion, delivery on one order; cancellation and restoration on another; capture stock, totals, order events, and movements before and after every transition; refresh (re-fetch) after every create/edit and compare.
3. Enforce the audit's fail criteria in the script: data reset, double deduction, cross-page total mismatch, missing events -> non-zero exit with a diff report.
4. Add archive/cleanup that runs even on failure; register as `smoke:uat-full` and add to smoke:live-audit.
5. Consolidate calculation regression tests (from Phases 007/009 plus audit section G tables) into a clearly named suite; add the role x action permission matrix tests against api/_actions.js.
6. Run everything locally: `npm.cmd test`, `npm.cmd run build`, `npm.cmd audit --audit-level=moderate`.
7. Run `smoke:uat-full` then the full umbrella smoke against production; fix forward any integration failures and re-run until green.
8. Rewrite docs/audit-handoff.md: July 10 54/100 baseline, per-finding remediation table (PCO-001..016 -> phase -> evidence), retest instructions, remaining known limitations; update audit-milestone.md.
9. Update .planning/STATE.md and ROADMAP.md; request the external audit rerun.

## Verification

- Check: `npm.cmd run smoke:uat-full` against production
  Expected: Pass with zero fail-criteria hits; cleanup complete.
- Check: `npm.cmd test`
  Expected: Calculation regression + permission matrix suites pass.
- Check: `npm.cmd run smoke:live-audit`
  Expected: Entire smoke family green.
- Check: docs/audit-handoff.md
  Expected: Every PCO finding mapped to phase, commit, and evidence.

## Rollback

Evidence-only phase; no product rollback surface. If integration failures are found, fixes land as scoped commits in the owning phase's area before the audit request.
