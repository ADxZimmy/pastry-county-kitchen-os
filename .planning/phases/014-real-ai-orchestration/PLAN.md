# Plan

## Outcome

The assistant is genuinely model-backed: it understands varied phrasing, holds conversation context, answers from live business data via read-only tools, states assumptions/confidence/sources, and every proposed change passes through the review-and-confirm flow. PCO-003 fully closed; AI branding restored honestly.

## Scope

Included:

- Server-side `/api/assistant` orchestration endpoint (Claude API, streaming), role-checked and rate-limited.
- Read-only tool layer: recipes, inventory, orders (with Phase 007 real pricing), costing, conversion rules.
- Structured response contract: answer, assumptions, confidence, data sources, proposed actions.
- Frontend conversational UI with context retention within a session; proposed actions -> Phase 010 review modal.
- Deterministic fallback when unconfigured/unavailable; env + budget guardrails.
- Branding update from Kitchen Helper to AI assistant naming.

Excluded:

- Model-initiated mutations of any kind (permanently out of scope by design).
- Advanced explanations/citations beyond stored data sources (post-MVP roadmap item).

## Steps

1. Read the claude-api skill; choose model and tool-use pattern; define the structured response schema and the read-only tool set with strict input validation.
2. Implement `/api/assistant`: auth + role check, per-user rate limit, conversation window handling, tool execution against the database (read-only queries), streaming structured output; `private, no-store` headers.
3. Add env configuration (ANTHROPIC_API_KEY, model, max tokens, monthly budget threshold) to .env.example and Vercel; endpoint returns a clear "assistant unavailable, using quick calculator" state when unconfigured.
4. Frontend: conversation UI with message history, assumption/confidence/source display, and proposed-action cards that open the ConversionReviewModal (or equivalent review) - confirm triggers the existing audited server actions only.
5. Fallback path: exact conversion-rule hits and simple costing questions answered deterministically without a model call; provider failure degrades to the deterministic helper with honest messaging.
6. Update naming via the shared constant; refresh helper copy to describe real capabilities and limits.
7. Tests: tool layer is read-only (attempted mutation tool call fails), response schema validation, rate limiting, unconfigured fallback, and review-modal gating (no data change without confirm).
8. Smoke: authenticated production check that the assistant answers a costing question using an order's real net total and that a proposed conversion requires confirmation; then umbrella smoke.

## Verification

- Check: `npm.cmd test`
  Expected: Tool/read-only/schema/fallback tests pass.
- Check: Ask the same costing question in three phrasings, then a follow-up depending on the prior answer
  Expected: Consistent, context-aware answers citing real order/recipe data.
- Check: Accept a proposed conversion
  Expected: Review modal shows old/suggested/edited/confidence/source; data changes only after confirm; audit entry written.
- Check: Remove API key in a preview environment
  Expected: Graceful deterministic fallback with honest copy.
- Check: `npm.cmd run smoke:live-audit`
  Expected: Pass.

## Rollback

Feature-flag the assistant endpoint; rollback = flag off, UI reverts to deterministic Kitchen Helper (Phase 010 state). No schema dependencies beyond additive config.
