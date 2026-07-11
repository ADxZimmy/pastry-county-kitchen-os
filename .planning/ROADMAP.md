# Roadmap

Revised 2026-07-11 after reconciling the July 10 expanded external audit (54/100, Not Ready) with commit `123643b` and the current source. Phase identifiers 007-015 remain stable, but execution is now risk-gated instead of relying only on numeric order. Full traceability is in `.planning/AUDIT-REMEDIATION.md`.

## Execution Order

1. `006a` Immediate Security Containment.
2. `007` Truthful Orders And Financials.
3. `008` Production Transaction Safety.
4. `009` Validation, Settings And Unit Policy.
5. `010` Conversion Apply And Honest Helper.
6. `015-A` Authenticated Demo Trust UAT.
7. `011` Auth And Session Hardening.
8. `012` Performance And Loading Architecture.
9. `013` Accessibility And UX Uplift.
10. `014` Real AI Orchestration, after an explicit provider/data-retention decision.
11. `015-B` Full Authenticated UAT And External Audit Rerun.

## Now

- Phase: 006a Immediate Security Containment
  Outcome: Remove or secure the unauthenticated stock-mutation route, authorize before maintenance DDL, restrict `schema.ensure`, fail closed on missing production session secrets, and stop exposing raw 500 details.
  Status: Planned; must ship before Phase 007 implementation begins.

## Demo Trust Program

- Phase: 007 Truthful Orders And Financials
  Outcome: Real per-order event history and actor attribution; server-canonical pricing and totals; data-derived dashboard guidance; no hard-coded 18,000 or mojibake. (PCO-001, 002, 014, 016)
  Status: Planned in independently deployable slices.

- Phase: 008 Production Transaction Safety
  Outcome: Correct timezone-aware queues; server-enforced lifecycle; locked, atomic, idempotent completion; explicit QC/confirmation; safe cancellation policy. (PCO-004, 005, 009)
  Status: Planned in queue/state-machine and completion/cancellation slices.

- Phase: 009 Validation, Settings And Unit Policy
  Outcome: Client/server validation, a genuinely shared policy module, effective or explicitly retired settings, and divisible-unit rules. (PCO-006, 007, 008)
  Status: Planned in validation/rounding and lifecycle/unit-policy slices.

- Phase: 010 Conversion Apply And Honest Helper
  Outcome: Conversion actions truthfully distinguish saving a rule from changing a recipe; recipe changes use review, confirmation, provenance, audited persistence, and reload verification; deterministic assistant is labelled Kitchen Helper. (PCO-003 demo closure)
  Status: Planned.

- Gate: 015-A Authenticated Demo Trust UAT
  Outcome: Core Prompt 10 create/edit/refresh/lifecycle checks and all phase smokes pass with isolated, reversible data; no unscripted demo before this gate passes.
  Status: Planned immediately after Phase 010.

## MVP Hardening Program

- Phase: 011 Auth And Session Hardening
  Outcome: Opaque server-side sessions in HttpOnly cookies, CSRF protection, private/no-store responses, distributed auth throttling, and hashed single-use password-reset tokens. (PCO-012, 015)
  Status: Planned after the Demo Trust Gate; immediate route/secret/error containment is pulled forward into Phase 006a.

- Phase: 012 Performance And Loading Architecture
  Outcome: Immutable hashed assets, route chunks, paginated role-filtered endpoints, shrinking bootstrap, Web Vitals, and a real CI performance gate. (PCO-010, 011)
  Status: Planned.

- Phase: 013 Accessibility And UX Uplift
  Outcome: AA contrast, semantic keyboard-operable links/actions, legible mobile nav, filtered dashboard links, context preservation, production scanning hierarchy, and recorded keyboard/screen-reader/mobile-keyboard evidence. (PCO-013 plus audit sections E/F)
  Status: Planned.

- Phase: 014 Real AI Orchestration
  Outcome: Provider-abstracted server-side assistant with read-only tools, traceable structured responses, strict data minimization/cost limits, and confirmation-gated proposed actions. (PCO-003 full closure)
  Status: Planned last among product phases; provider, retention, and budget decision required before implementation.

- Gate: 015-B Authenticated UAT And External Audit Rerun
  Outcome: Full Prompt 10 evidence, calculation/permission/security regression suites, production-safe smoke, updated handoff, and a fresh independent audit.
  Status: Planned after Phases 011-014.

## Later

- Phase: Certification Evidence Closeout
  Outcome: External SPF/DNS, controlled email delivery, backup/restore or rollback drills, keyboard/screen-reader sign-off, and manual operator evidence for a 100/100 certification claim.
  Status: Backlog; DNS evidence also affects production email verification in Phase 011.

- Phase: Post-MVP improvements backlog
  Outcome: Configurable role-based mobile nav, offline production, purchase orders, supplier comparison, price history, stock-exhaustion prediction, waste analytics, recipe versions, and batch labels/print sheets.
  Status: Waiting until remediation and the audit rerun complete.
