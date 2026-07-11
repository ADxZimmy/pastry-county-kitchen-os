# Context

## Goal

Make conversion suggestions genuinely apply through a review-and-confirm workflow, and relabel the assistant honestly as a deterministic helper until the real model-backed assistant ships in Phase 014. Interim closure of audit finding PCO-003 (full closure in Phase 014).

## Relevant Files

- Path: src/lib/kitchen.ts:440-682 (assistant rule engine)
  Why it matters: Keyword-matching deterministic responses presented as "AI Assistant"; the audit calls the framing materially overstated.
- Path: src/App.tsx (assistant page, "Use this conversion" actions)
  Why it matters: Some conversion actions only fire a success toast; nothing is written to the recipe or conversion library.
- Path: src/types.ts (ConversionRule with confidence/verification flags)
  Why it matters: Phase 003/004 added confidence and verification fields; the end-to-end review/apply workflow the audit expected is incomplete.
- Path: api/_actions.js (conversion rule actions)
  Why it matters: Applying a conversion must persist through a role-checked server action with audit logging.

## Decisions

- Decision: Every "apply" path opens a review step showing original value, suggested value, editable final value, confidence, source rule, and requires explicit confirmation before a server action persists it.
  Reason: Audit PCO-003 - a cosmetic action is riskiest when the user believes data changed.
- Decision: Treat three intents separately: save/verify a reusable conversion rule, apply a converted quantity/unit to a specific recipe-item draft, or open a recipe editor from a free-form helper result. A standalone helper result never claims a recipe changed.
  Reason: persisting a library rule is not the same operation as changing a recipe line; the original plan blurred those outcomes.
- Decision: Approved rules are stored separately from unverified suggestions (verified flag + provenance), matching the existing confidence/verification schema.
  Reason: Audit expects traceable recommendations.
- Decision: Interim rebrand of assistant surfaces to "Kitchen Helper" with copy that says it answers from saved recipes, costs, and conversion rules; no "AI" claims until Phase 014 ships the model-backed service.
  Reason: The owner chose to build real AI last; until then the product must not overstate capability in demos or to operators.

## Risks

- Risk: Rebrand copy churn when Phase 014 restores an AI identity.
  Mitigation: Keep naming in one shared constant/string module so the Phase 014 rename is a single change.
- Risk: Users may have "applied" conversions previously that silently did nothing.
  Mitigation: Release note in UAT; no data migration needed because nothing was written.
- Risk: Updating a recipe line can overwrite source-import costing/provenance.
  Mitigation: preserve the original quantity/unit/source fields and attach conversion rule, approver, and timestamp provenance; require the normal recipe save transaction.
