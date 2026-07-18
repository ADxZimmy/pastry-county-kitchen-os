# Verification

## Stage 015-A — Demo Trust Gate: PASSED (2026-07-11)

- Command: `npm.cmd run smoke:uat-core` against `https://pastry-county-kitchen-os.vercel.app`
  Result: **30/30 checks passed. Demo Trust Gate PASSED.** Run id `AUDIT-UAT-1784387883299-53b5tx`.
- Command: `npm.cmd run smoke:uat-full`
  Result: Not implemented; R1 gate after Phase 014.

`scripts/uat-core-smoke.mjs` builds the audit's Prompt 10 scenario under a unique run id, asserts each Demo Trust finding against production, and cleans up in `finally`.

### Safety contract honoured

- Unique `AUDIT-UAT-<timestamp>-<random>` run id; every created record tracked in a manifest.
- Aborts before ANY mutation if the run id already appears in production data (checked live).
- Only manifest-owned ids are updated or archived; no pre-existing business record is touched.
- Cleanup in `finally`, then a residue check: `archiveFailures: []`, `activeResidue: []`. The gate fails if either is non-empty.
- Retained audit/event/movement ledger rows for the temporary ids are documented, not hidden.

### Evidence by finding

| Finding | Evidence |
|---|---|
| PCO-001 | Orders A and B each carry only their own events (2 and 1); no cross-linked events; actor is the real user (`owner@pastrycounty.ng`), not `system`; no fabricated "May 18, 2026" or "Dark Chocolate and Eggs" entries |
| PCO-002 | Order A netTotal 7,500 and Order B netTotal 40,000 — each its own price, neither 18,000, and the two differ |
| PCO-003 | Stale conversion apply refused 409; reviewed apply persisted 300g -> 0.3kg with provenance (`convertedFrom 300g`, applying user); shipped bundle contains "Kitchen Helper" and no "AI Assistant" |
| PCO-004 | Production start accepted for a reserved order; backwards transition refused 409 |
| PCO-005 | Repeat produce returned `alreadyProduced` with stock unchanged (4812.5 -> 4812.5) — deducted exactly once |
| PCO-006 | Zero base yield rejected 400 |
| PCO-008 | Fractional count stock (1.5 pack) rejected 400 |
| PCO-009 | Cancellation without a reason rejected 400; cancelling a produced order blocked 409; pre-production cancellation succeeded and the reason is recorded on the event |
| PCO-016 | Shipped bundle contains no `Â·` mojibake |
| Audit section G | Scaling 16->12 verified by REAL server-side deductions: flour 225, sugar 375, cocoa 90, dark chocolate 187.5, eggs 3, coconut oil 135 — exactly the audit's expected values |

Scaling is a client-side calculation, so the gate verifies it the way that cannot be argued with: it produces a 12-piece order and asserts the ingredients actually removed from stock match the audit's expected scaled quantities.

## Gate outcome

The D1 Demo Trust Gate is GREEN. An unscripted operator or investor demonstration is approvable as of this run, for the Demo Trust scope (PCO-001..009, 014, 016). This is NOT an MVP-readiness or certification claim, and no replacement audit score is self-assigned.

## Remaining (stage 015-B, after Phases 011-014)

- Extend to `scripts/uat-full-smoke.mjs`: cookie/CSRF/login/logout/reset/revocation, role-filtered paginated APIs, caching/chunk/performance evidence, keyboard/axe evidence, provider/fallback assistant outcome, archives/reports.
- Permanent suites: calculation/policy fixtures, concurrent completion, full role x action matrix, safe-error/no-store/cookie/CSRF projection tests.
- Rewrite `docs/audit-handoff.md` and `docs/audit-milestone.md` with the 54/100 baseline and a finding -> phase -> commit -> evidence matrix, then request a fresh independent audit and report its actual result.

## Residual Risk

- Risk: production smoke leaves immutable audit/ledger evidence even after records are archived.
  Owner: disclosed in the cleanup manifest; non-manifest records are never touched.
- The gate runs against production with reversible, manifest-owned data. Concurrency/fault-injection cases remain deferred to a preview database in 015-B, per plan step 4.
- Role/permission coverage here is the Owner/Admin path plus unit-level role tests; the full role x action matrix is 015-B.
