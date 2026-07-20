# Verification

## Slice 014-A — decision and contracts (committed 2026-07-19, `773adeb`)

### The gate

Phase 014's step 1 requires an owner decision before any code, because this is the first phase that would send business data to a third party. Recorded in `DECISION.md`.

Owner direction was "multipurpose — any API can work", so the assistant is built against a **provider-neutral adapter**: no vendor is hardcoded, and none is required for the app to run. Data boundary approved as **operational data with customers redacted**. Budget **adjustable**.

### What this slice does and does not do

It contacts no provider and needs no key. It defines what may leave the server, what may be spent, and what a provider answer must look like to be trusted. **Current behaviour is unchanged** — unconfigured is a supported state and the deterministic Kitchen Helper still answers. No AI branding is restored.

### Redaction

An **allow-list, not a deny-list**, so a column added to a table later does not reach a provider because nobody remembered to exclude it.

| Sent | Never sent |
|---|---|
| Recipe lines, quantities, units, yields | Staff names, emails, roles |
| Ingredient names, stock, reorder levels, costs | Audit trail, settings, low-stock recipient |
| Order status, dates, pricing totals | Session/CSRF tokens, password hashes |
| Conversion rules | Stock movements, lots, QC logs, order events |

- Customer names and phone numbers become a **stable placeholder** (`Customer 1784`), applied *before* fields are picked — so a real name cannot survive by being copied into an allowed field. Stable, so the assistant can still refer to the same order across turns.
- Order notes are dropped entirely, because they routinely carry contact details.
- A **Viewer's payload omits costs and money**, matching the role projection the app already enforces. The assistant must not become a way around it.
- `findLeakedFields` re-checks an assembled payload whatever built it.

### Stored text is untrusted

Recipe and order notes are operator-supplied and therefore attacker-controllable. They are quoted as data with an explicit notice that data tags are never instructions, and an attempt to close the quoting is neutralised. Prompt injection in stored notes is a **tested case**, not an assumption.

### The response contract

The part that matters most: **a model cannot propose a write.** Only four actions exist and all merely open an existing review form. Any other action type — including real action names like `order.produce` and `inventory.adjust` — is rejected outright rather than sanitised, and an invalid response yields no usable object at all, so nothing can be acted on.

### Budget

Adjustable as instructed, but bounded: defaults to $10, clamps at $1000, ignores nonsense. A mistyped environment variable cannot authorise a runaway bill. Reaching the ceiling falls back to the deterministic helper rather than failing.

### Verification

- 27 contract tests: redaction, role isolation, injection quoting, provider neutrality, key non-exposure, budget clamping, mutation refusal.
- `npm.cmd test` — **266/266**.

## Remaining in Phase 014

- **014-B** read-only orchestration: the server endpoint using Phase 011 cookie/CSRF primitives, read-only tools, bounded session context, and the provider adapter's network calls.
- **014-C** UI, review routing, and an authenticated smoke.

Both need a provider key configured to verify end to end. Until the owner sets `ASSISTANT_PROVIDER` and `ASSISTANT_API_KEY`, those slices can be written but not proven against a live model, and no AI capability claim should be made.

## Residual Risk

- Retention and training terms are **provider-dependent and not claimed here**. Code cannot enforce a third party's policy; the owner must confirm the chosen provider's terms before enabling it, since recipes and costs are commercial IP.
- The redaction allow-list is only correct while it matches the app's own role projection. Both are tested, but they are two places that must agree.
