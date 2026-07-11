# Context

## Goal

Replace the deterministic Kitchen Helper with a genuine server-side, model-backed assistant: read-only tools over business data, structured traceable responses, and confirmation-gated proposed actions. Full closure of audit finding PCO-003. Deliberately sequenced last among feature phases per owner decision (2026-07-10).

## Relevant Files

- Path: src/lib/kitchen.ts (rule engine responses)
  Why it matters: Current deterministic answers become the fallback/offline path or are retired; margin/costing answers must reuse the Phase 007 real pricing.
- Path: api/ (new orchestration endpoint)
  Why it matters: All model calls must be server-side; the API key never reaches the browser.
- Path: src/App.tsx Kitchen Helper page + Phase 010 ConversionReviewModal
  Why it matters: The review/confirm modal built in Phase 010 is the only path by which any model suggestion becomes data.
- Path: api/_rateLimit.js, api/_auth.js
  Why it matters: Per-user rate limiting and role checks on the assistant endpoint; cost guardrails.
- Path: .env.example
  Why it matters: provider-neutral server-only model/config entries must be documented only after the provider, retention, region, and budget decision.

## Decisions

- Decision: Use a provider adapter and make provider/model selection an explicit implementation gate based on data retention, regional/privacy terms, tool support, latency, and monthly budget. Do not depend on an unavailable provider-specific skill or hard-code a provider in planning.
  Reason: the audit requires genuine, safe orchestration, not a specific vendor; never allow the model to mutate inventory, recipes, orders, or costing directly.
- Decision: Structured JSON responses: answer, assumptions, confidence, data sources, proposed actions. Proposed actions route through the Phase 010 review modal and the Phase 009 requiresAiConfirmation policy.
  Reason: Traceable recommendations with explicit user approval per audit expectation.
- Decision: Guardrails: per-user rate limits, max tokens per request, monthly budget alarm, graceful degradation to the deterministic helper when the provider is unavailable or unconfigured.
  Reason: Cost control and no hard dependency for core workflows.
- Decision: Tool responses are role-filtered and data-minimized; customer/staff PII and secrets are excluded unless a narrowly defined question and role require a safe field. Recipe/order notes are treated as untrusted data, never instructions.
  Reason: model context creates a new disclosure and prompt-injection boundary.
- Decision: Restore AI branding only when this ships ("Kitchen Assistant (AI)"), updating the Phase 010 shared naming constant.
  Reason: Honest labeling sequence agreed with owner.

## Risks

- Risk: Token spend on a small-business product.
  Mitigation: Small default model, response caching for repeated conversions, strict max-token limits, budget monitoring.
- Risk: Hallucinated quantities entering business data.
  Mitigation: Read-only tools; every mutation goes through review modal with source data displayed; conversion answers must cite the stored rule or be labelled unverified.
- Risk: Latency versus the instant deterministic helper.
  Mitigation: Streaming responses; deterministic fast-path for exact conversion-rule hits.
- Risk: Business/customer data is sent to an external provider.
  Mitigation: owner approval of provider terms/retention, strict field allow-lists, redaction tests, no raw bootstrap/prompt dumps, and an operator-visible capability/privacy note.
