# Context

## Goal

Produce authenticated end-to-end evidence twice: an early Demo Trust Gate immediately after Phase 010, then a full MVP/audit gate after Phases 011-014. Lock in regression suites for calculations, transactions, security, and permissions, and hand off to a fresh external audit only after the final gate. Closes audit Prompt 10 and missing-feature items 17, 18, 20.

## Relevant Files

- Path: scripts/*.mjs
  Why it matters: Existing smoke harness is the base for the full authenticated UAT script.
- Path: .planning/phases/007-014
  Why it matters: Every phase's verification must still hold when run together; this phase is the integration gate.
- Path: docs/audit-handoff.md, docs/audit-milestone.md
  Why it matters: Must be rewritten around the July 10 audit baseline (54/100) and the remediation evidence before the rerun.
- Path: src/App.test.ts, api/_actions.test.js
  Why it matters: Homes for the consolidated calculation regression suite and role/permission test matrix.

## Decisions

- Decision: Follow audit Prompt 10 exactly in an isolated test workspace: the specified ten inventory records, 16-piece Brownies recipe, three scaling cases, the 12-piece and mixed 8-piece + two-loaf orders, full lifecycle transitions with before/after value capture, refresh after every create/edit.
  Reason: The audit marked authenticated persistence testing as outstanding; matching its script makes the rerun directly comparable.
- Decision: Fail criteria are the audit's: data resets, double stock deduction, totals differing across pages, or missing audit/order events.
  Reason: Objective pass/fail, no self-grading.
- Decision: Add a permanent `smoke:uat-full` production script plus automated calculation regression (scaling, costing, margin with real prices, rounding policies) and role/permission matrix tests (every mutating action x every role).
  Reason: Missing-feature items 17 and 18; keeps the evidence reproducible for every future audit.
- Decision: Refresh audit handoff docs and request the external audit rerun only after `smoke:uat-full` passes against production.
  Reason: Ship gate discipline.
- Decision: Run `015-A` after Phase 010 rather than delaying all authenticated UAT until medium-priority MVP work is complete; run `015-B` again after Phases 011-014.
  Reason: the audit explicitly blocks any operator/investor demo until authenticated create/edit/refresh/cross-module UAT is complete.
- Decision: UAT may touch only records created by its unique run id and must refuse to mutate pre-existing records. Destructive/concurrency fault injection runs against an isolated preview database first; production receives controlled reversible lifecycle probes.
  Reason: the app is not multi-tenant, so "isolated workspace" must be enforced by the harness rather than assumed.

## Risks

- Risk: UAT creates real data in the production database.
  Mitigation: unique run manifest, created-record allow-list, baseline counts, refuse-on-collision, cleanup in `finally`, archive/correction rather than touching real records, and a cleanup report that names unavoidable audit/ledger evidence.
- Risk: Integration issues appear only when all phases interact (e.g., policy service x state machine x pricing).
  Mitigation: That is the purpose of this phase; budget fix-forward time before the external rerun.
- Risk: Certification evidence items (DNS, backup drills, operator sign-offs) remain external.
  Mitigation: Keep them tracked in the separate Certification Evidence Closeout roadmap item; do not conflate with this phase's gate.
