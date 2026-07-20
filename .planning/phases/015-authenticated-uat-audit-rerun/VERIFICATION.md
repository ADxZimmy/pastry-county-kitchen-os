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

## Stage 015-B — MVP and audit rerun gate: PASSED (2026-07-19, commit `8a19e66`)

### `npm run smoke:uat-full` — **9/9 gates passed** against production

| Gate | Time | Covers |
|---|---|---|
| `test` | 58s | calculation, policy, role matrix, assistant contracts (316 tests) |
| `a11y:contrast` | 3s | PCO-013 |
| `perf:budget` | 3s | PCO-011 |
| `smoke:uat-core` | 28s | PCO-001..009, 014, 016 |
| `smoke:auth-cookie` | 11s | PCO-012, RS-006 |
| `smoke:password-reset` | 14s | PCO-015 |
| `smoke:route-data` | 10s | PCO-010 |
| `smoke:a11y` | 159s | PCO-013 |
| `smoke:live-audit` | 163s | end-to-end browser regression |

The gate composes the suites that already prove each area rather than re-implementing their assertions. A second copy would drift from the first — the failure mode this programme hit twice already (a smoke asserting a stale contract, and a check written so it could never match what it tested). It stops at the first failure rather than piling production side effects onto a known-broken state.

### Permission matrix (plan step 8)

`api/permission-matrix.test.js` — **42 checks**. The action list is derived from `api/_actions.js` at test time, not copied, so a new action cannot be added without a role decision. It asserts:

- every handled action has a non-empty allow-list naming only known roles;
- an unrecognised action falls back to Owner/Admin, never to everyone;
- **a Viewer can reach no mutating action at all** — the single most important row;
- staff administration, settings and schema stay Owner/Admin-only;
- a Baker can run production but not touch money or staff; an Inventory Manager can move stock but not run production;
- no absent, empty, spoofed, mis-cased or whitespace-padded role satisfies any check.

Cross-checking declared against handled actions found one action (`schema.ensure`) outside the roles map; it is explicitly special-cased to Owner/Admin, so it is covered rather than a gap.

### Handoff (plan step 12)

`docs/audit-handoff.md` rewritten around the 54/100 baseline: finding → phase → commit → evidence for all 16 PCO and 7 RS findings, reproduction commands, the defects the gates themselves caught, and **eight limitations deliberately not claimed**. It states plainly that the June 96/100 is superseded and **claims no replacement score**.

## Remaining: the audit request itself (plan step 13)

Requesting a fresh independent audit is **owner action** — I cannot commission one. Everything an auditor needs is prepared and reproducible.

## Not covered by this gate

Stated so the pass is not read as more than it is:

- **Concurrent completion and fault injection against a preview database** (plan step 8). Production probes were idempotent and reversible only; no dedicated preview database exists. The concurrency guarantee rests on the `production_runs` unique constraint and its unit tests, verified live only as repeat-produce idempotency.
- **Manual keyboard-only and screen-reader verification** — owner work; automated axe catches roughly half of real defects.
- **End-to-end redemption of an emailed reset link** — needs mailbox access or a preview database, and delivery itself is currently unproven (two of three reset emails ended `delivery_delayed`).
- **A model-backed assistant outcome** — no provider is configured, so the deterministic fallback is the only path exercised.
- **`docs/audit-milestone.md`** was not rewritten; `audit-handoff.md` is the single current handoff and supersedes it.

## Residual Risk

- Risk: production smoke leaves immutable audit/ledger evidence even after records are archived.
  Owner: disclosed in the cleanup manifest; non-manifest records are never touched.
- The gate runs against production with reversible, manifest-owned data. Concurrency/fault-injection cases remain deferred to a preview database in 015-B, per plan step 4.
- Role/permission coverage here is the Owner/Admin path plus unit-level role tests; the full role x action matrix is 015-B.
