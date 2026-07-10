# Roadmap

Updated 2026-07-10 for the July 10 expanded external audit (54/100, findings PCO-001..PCO-016). Remediation program: phases 007-015. Finding-to-phase map:

| Finding | Severity | Phase |
|---|---|---|
| PCO-001 fabricated order timeline | Critical | 007 |
| PCO-002 fixed NGN 18,000 selling price | Critical | 007 |
| PCO-003 AI overstated / cosmetic actions | High | 010 (interim honesty + real apply), 014 (real AI) |
| PCO-004 This Week filter wrong | High | 008 |
| PCO-005 unguarded batch completion | High | 008 |
| PCO-006 zero/negative yields reach scaling | High | 009 |
| PCO-007 settings not applied | High | 009 |
| PCO-008 decimal packaging units | Medium | 009 |
| PCO-009 cancel lacks confirmation | Medium | 008 |
| PCO-010 monolithic bootstrap/bundle | Medium | 012 |
| PCO-011 asset cache revalidation | Medium | 012 |
| PCO-012 localStorage tokens / cache privacy | Medium | 011 |
| PCO-013 accessibility gaps | Medium | 013 |
| PCO-014 static dashboard guidance | Medium | 007 |
| PCO-015 no password recovery | Medium | 011 |
| PCO-016 encoding artefacts | Low | 007 |
| Prompt 10 authenticated UAT + regression/permission suites | - | 015 |

## Now

- Phase: 007 Truthful Orders And Financials
  Outcome: Real order-event timelines, persisted order pricing driving all margin math, data-derived dashboard guidance, no hard-coded 18,000 or mojibake. (PCO-001, 002, 014, 016)
  Status: Planned.

## Next

- Phase: 008 Production Transaction Safety
  Outcome: Shared timezone-aware production eligibility, correct Today/Tomorrow/This Week buckets, server-enforced Ready -> In Progress -> QC -> Completed state machine, atomic idempotent batch completion with confirmation/QC modal, guarded cancellation with reversal handling. (PCO-004, 005, 009)
  Status: Planned.

- Phase: 009 Validation, Settings And Unit Policy
  Outcome: Client+server yield/quantity validation, central policy service making every setting effective (gram rounding, deduction stage, negative inventory, count rounding), divisible vs indivisible units, contract tests per setting. (PCO-006, 007, 008)
  Status: Planned.

- Phase: 010 Conversion Apply And Honest Helper
  Outcome: Review-and-confirm workflow makes conversion suggestions genuinely persist with provenance; assistant rebranded Kitchen Helper until Phase 014. (PCO-003 interim)
  Status: Planned.

- Phase: 011 Auth And Session Hardening
  Outcome: HttpOnly Secure cookie sessions with rotation/revocation, private no-store caching on authenticated responses, rate-limited single-use password recovery. (PCO-012, 015)
  Status: Planned.

- Phase: 012 Performance And Loading Architecture
  Outcome: Immutable hashed-asset caching, route-level code splitting with lazy parser imports, dashboard summary + paginated orders/audit/movements endpoints, Web Vitals monitoring and Lighthouse CI budgets. (PCO-010, 011)
  Status: Planned.

- Phase: 013 Accessibility And UX Uplift
  Outcome: AA contrast, keyboard-operable rows, legible mobile nav with Recipes primary, dashboard cards deep-linking to filtered lists, list-context preservation, production card scan hierarchy, builder ergonomics. (PCO-013 + audit sections E/F)
  Status: Planned.

- Phase: 014 Real AI Orchestration
  Outcome: Server-side Claude-backed assistant with read-only tools, structured traceable responses, confirmation-gated proposed actions, deterministic fallback; AI branding restored. (PCO-003 full closure; owner chose to build real AI last, 2026-07-10)
  Status: Planned.

- Phase: 015 Authenticated UAT And Audit Rerun
  Outcome: Audit Prompt 10 executed end to end via `smoke:uat-full`, permanent calculation and role/permission regression suites, refreshed audit handoff docs, fresh external audit requested. 
  Status: Planned.

## Later

- Phase: Certification Evidence Closeout
  Outcome: External SPF/DNS, controlled email delivery, backup/restore or rollback drills, keyboard/screen-reader sign-off, and manual operator evidence for a 100/100 certification claim.
  Status: Backlog; DNS evidence also unblocks full Phase 011 email verification.

- Phase: Post-MVP improvements backlog
  Outcome: Configurable role-based mobile nav, offline-friendly production view, purchase orders, supplier price comparison, price-history charts, stock-exhaustion prediction, waste analytics, recipe version history, batch labels/printable sheets, richer AI explanations (audit section I "after MVP" list).
  Status: Waiting until the remediation program and audit rerun complete.
