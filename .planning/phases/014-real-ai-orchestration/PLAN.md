# Plan

## Outcome

If the owner approves a provider after privacy/retention/cost review, the assistant is genuinely model-backed through a server-side provider adapter. It understands varied phrasing and session context, answers from role-filtered read-only tools, states assumptions/confidence/source records, resists tool/prompt injection, and routes every proposed change through Phase 010 review. If no provider is approved, Kitchen Helper remains the honest shipped outcome and AI branding is not restored.

## Scope

Included:

- Provider/privacy/budget decision record before code.
- Server-side provider adapter and assistant endpoint; no browser API key.
- Role-filtered, data-minimized read-only tools for recipes, inventory, orders/pricing, costing, and conversion rules.
- Structured response contract and source-record references.
- Session-scoped conversation context with bounded retention.
- Proposed actions routed to existing reviewed/audited transactions only.
- Shared rate/cost limits, observability, deterministic fallback, and honest capability copy.

Excluded:

- Model-initiated mutations.
- Sending raw bootstrap, secrets, password/session/audit internals, or unnecessary customer/staff PII to a provider.
- Claiming full PCO-003 closure if provider approval/integration is skipped; in that case Phase 010's honest helper is the accepted product scope.

## Delivery Slices

### 014-A Decision And Contracts

1. Record owner decision on provider, model class, region, data retention/training terms, deletion controls, expected latency, monthly budget, and fallback. If not approved, close the phase as `honest helper retained` and do not add AI branding.
2. Define provider-neutral interfaces, structured response schema (`answer`, `assumptions`, `confidence`, `sources`, `proposedActions`), conversation limits, and tool schemas with strict validation.
3. Define field allow-lists per role/tool. Exclude secrets and private admin data; redact customer contact details by default. Treat all database text as quoted untrusted data and test prompt-injection strings in notes.

### 014-B Read-Only Orchestration

4. Implement the server endpoint with Phase 011 cookie/CSRF/privacy primitives, shared rate limiting, request/token/time budgets, correlation/usage logging without prompt-content leakage, and a provider adapter.
5. Implement read-only database tools using parameterized queries and database credentials that cannot execute application mutations where feasible. Enforce role projection independently of model requests.
6. Add bounded session context and structured/streamed response handling. Validate every provider response; invalid output degrades safely without executing proposed actions.
7. Keep exact verified conversion and simple deterministic costing fast paths; provider failure/unconfigured state returns Kitchen Helper results with honest messaging.

### 014-C UI, Review, And Evidence

8. Display assumptions, confidence, source record links, freshness timestamps, limits, and proposed-action cards. Proposed actions populate Phase 010 review forms; confirmation calls only existing audited server actions.
9. Restore AI branding only when the provider-backed path is enabled and verified. Keep an operator-visible privacy/capability explanation and deterministic fallback label.
10. Add tests for field redaction, role isolation, prompt injection in stored notes, read-only enforcement, schema validation, conversation bounds, cost limits, fallback, and no-write-without-review.
11. Run an authenticated smoke using non-sensitive temporary records, then the full umbrella smoke; record provider/model configuration without keys.

## Verification

- Check: provider decision record
  Expected: retention/privacy/region/budget approved, or explicit decision to retain honest Kitchen Helper without AI claims.
- Check: malicious instruction embedded in recipe/order notes
  Expected: treated as data; no tool escalation, secret access, or mutation.
- Check: Viewer/Baker/Inventory Manager tool calls
  Expected: each receives only fields permitted by the server role projection, independent of prompt wording.
- Check: attempted mutation/tool injection
  Expected: no mutation tool exists; proposed action only opens a reviewed form and data changes only after normal authorization/confirmation.
- Check: provider unavailable/key absent/budget reached
  Expected: bounded deterministic fallback with honest copy and no broken core workflow.
- Check: `npm.cmd test`, `npm.cmd run build`, authenticated assistant smoke
  Expected: pass; usage/redaction logs contain no secrets or unnecessary PII.

## Rollback

Feature-flag the provider adapter. Rollback disables the provider path and returns to Phase 010 Kitchen Helper. No business-data schema depends on the model, and AI branding is removed automatically when the flag is off.
