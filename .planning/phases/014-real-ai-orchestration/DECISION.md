# Provider Decision Record (Phase 014, step 1)

Recorded 2026-07-19 on the owner's instruction. The plan requires this before any code.

## Decision

**Approved, provider-neutral.** The owner's direction was "multipurpose — any API can work", so the assistant is built against a provider-neutral adapter rather than one vendor. No provider is hardcoded; the deployment selects one by configuration, and none is required for the app to work.

| Item | Decision |
|---|---|
| Provider | Not fixed. Adapter supports Anthropic and OpenAI-compatible APIs, selected by `ASSISTANT_PROVIDER`. |
| Model class | Configurable via `ASSISTANT_MODEL`. Sensible default per provider; no model name hardcoded into logic. |
| Key handling | Server-side only, from environment. Never in the repository, never sent to the browser, never logged. Same handling as `SESSION_SECRET` and `RESEND_API_KEY`. |
| Region | Provider default. Not asserted, because the adapter is not tied to one vendor's region list. |
| Retention / training | Provider-dependent and therefore **not claimed here**. The owner must confirm the chosen provider's terms before enabling it in production; the code cannot enforce a third party's retention policy. |
| Deletion controls | Conversation context is session-scoped and bounded in the app; the app stores no transcript. Anything the provider retains is governed by the provider's terms. |
| Budget | **Adjustable**, per the owner's instruction. `ASSISTANT_MONTHLY_BUDGET_USD` sets a hard server-side ceiling, default 10. Reaching it falls back to the deterministic helper rather than failing. |
| Fallback | Kitchen Helper. Unconfigured, over budget, provider error, or invalid response all degrade to it with honest copy. |

## Data boundary

Approved: **operational data with customers redacted.**

| Sent | Never sent |
|---|---|
| Recipe names, lines, quantities, units, yields | Customer names and phone numbers (redacted to placeholders) |
| Ingredient names, units, stock levels, reorder levels, costs | Staff names, emails, roles |
| Order status, due dates, pricing totals | Session tokens, CSRF tokens, password hashes, reset tokens |
| Conversion rules | Audit trail, notification settings, low-stock recipient |
| | API keys and any environment value |

Customer identity is replaced with a stable placeholder before anything leaves the server, so the assistant can still reason about "the order due Friday" without the provider receiving a real person's name or number.

## Standing constraints

- **No mutation tool exists.** The model cannot write. A proposed action only opens the existing Phase 010 review form, and any change still goes through the normal authorised, audited server action.
- **All database text is untrusted input.** Recipe and order notes are attacker-controllable, so they are quoted as data and never concatenated into instructions. Prompt-injection strings in stored notes are a tested case, not an assumption.
- **Role projection is enforced server-side**, independently of anything the model asks for. A Viewer's tool call returns a Viewer's fields regardless of prompt wording.
- **AI branding stays off** unless the provider path is enabled and verified. If it is disabled, the honest Kitchen Helper copy from Phase 010 remains, because claiming a capability that is switched off is the defect this programme spent Phase 010 removing.

## Owner follow-up before enabling in production

1. Choose the provider and confirm its data-retention and training terms are acceptable for recipe and cost data, which is commercial IP.
2. Set `ASSISTANT_PROVIDER`, `ASSISTANT_API_KEY` and optionally `ASSISTANT_MODEL` / `ASSISTANT_MONTHLY_BUDGET_USD` on the Vercel project.
3. Until those are set the assistant stays deterministic, which is a supported state and not a broken one.
