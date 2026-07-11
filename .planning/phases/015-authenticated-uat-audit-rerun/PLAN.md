# Plan

## Outcome

An authenticated Demo Trust UAT passes immediately after Phase 010 before any unscripted demo. After MVP hardening, the full Prompt 10 UAT, calculation/transaction/security/permission suites, production-safe smoke family, cleanup evidence, and handoff all pass before a fresh independent audit is requested.

## Scope

Included:

- `015-A` core authenticated UAT for PCO-001..009, 014, 016 after Phase 010.
- `015-B` full Prompt 10 and all remediation/security/performance/accessibility integration evidence after Phase 014.
- Unique-run manifest, allow-listed temporary records, before/after capture, refresh-after-write, cleanup report, and refuse-to-touch-existing-data guards.
- Permanent calculation, concurrency/idempotency, handler security, and role/action permission suites.
- Updated audit handoff/milestone/state and fresh external audit request.

Excluded:

- Self-assigning a replacement audit score.
- Certification DNS/backup/operator evidence.
- Unbounded destructive testing against real production records.

## Stage 015-A: Demo Trust Gate

1. Build `scripts/uat-core-smoke.mjs` around a unique `AUDIT-UAT-<timestamp>-<random>` run id and manifest. The harness may update/archive only ids it created; collision or unexpected pre-existing linkage aborts before mutation.
2. Create the audit's inventory fixtures, 16-piece Brownies recipe, scaling 16->12/8/24 cases, priced 12-piece order, and mixed order. Verify Phase 007 event/pricing truth, Phase 008 queue/state/QC/idempotency/cancellation behavior, Phase 009 validation/policies/units, and Phase 010 conversion review/apply.
3. Refresh after every create/edit/status transition and compare API values with each relevant UI/page calculation. Capture before/after stock, FEFO lots, movements, events, totals, and statuses.
4. Run concurrency/fault-injection cases against a dedicated preview database first. In production, run controlled idempotent/reversible probes only, never mutate a pre-existing business record.
5. Cleanup in `finally`: archive created business records, restore modified settings, create explicit correction movements where required, and emit a machine-readable cleanup report. Fail the gate if active temporary records or unexpected deltas remain.
6. Register `smoke:uat-core`. Run it plus Phase 007-010 targeted smokes and the umbrella smoke. Record D1 results in planning verification; no unscripted demo until green.

## Stage 015-B: MVP And Audit Rerun Gate

7. Extend to `scripts/uat-full-smoke.mjs` after Phases 011-014: cookie/CSRF/login/logout/reset/revocation, role-filtered paginated APIs, caching/chunks/performance evidence, keyboard/axe evidence references, provider/fallback assistant outcome, archives/reports, and full lifecycle persistence.
8. Add permanent automated suites:
   - calculation/policy fixtures from audit section G;
   - concurrent completion and rollback/idempotency tests;
   - every mutating handler/action across anonymous, revoked, Owner/Admin, Baker, Inventory Manager, and Viewer;
   - safe-error, no-store, cookie, CSRF, and sensitive-response projection tests.
9. Add `smoke:uat-full` to the protected/manual live workflow and the umbrella smoke only when runtime/cost is acceptable. Keep pull-request CI non-secret and deterministic.
10. Run clean local/CI gates: tests, build, dependency audit, diff check, migration preflight, public performance budgets, and targeted preview fault tests.
11. Run the full controlled production UAT and smoke family. Review the cleanup manifest manually; do not treat archive-only residue as invisible—document retained audit/ledger evidence.
12. Rewrite `docs/audit-handoff.md` and `docs/audit-milestone.md` with the July 10 54/100 baseline, PCO/RS finding -> phase -> commit -> evidence matrix, exact retest instructions, skipped/external evidence, and known limitations.
13. Update `.planning/STATE.md`, `ROADMAP.md`, and phase verification/UAT files. Request a fresh independent audit; report its actual result without carrying forward 96/100 or self-scoring.

## Verification

- Check: `npm.cmd run smoke:uat-core` after Phase 010
  Expected: all D1 truth/transaction/validation/helper scenarios pass; cleanup manifest has no unexpected active data or deltas.
- Check: automated security/permission matrix
  Expected: every deployed mutator is covered at the handler boundary and rejects anonymous/revoked/wrong-role callers before business SQL.
- Check: `npm.cmd run smoke:uat-full` after Phase 014
  Expected: full Prompt 10 plus MVP integration evidence passes with controlled production cleanup.
- Check: `npm.cmd test`, `npm.cmd run build`, `npm.cmd audit --audit-level=moderate`, CI/performance/a11y gates, `npm.cmd run smoke:live-audit`
  Expected: all required gates pass or any skip is explicitly blocking; no silent advisory failures.
- Check: handoff and audit request
  Expected: every PCO-001..016 and RS-001..007 maps to implementation commit and evidence; no unsupported score/readiness claim.

## Rollback

The phase primarily adds evidence harnesses and docs. UAT must always retain its run manifest and cleanup path. If a product regression is found, stop the gate, clean up only manifest-owned data, and return the defect to its owning phase; do not weaken assertions to obtain a pass.
