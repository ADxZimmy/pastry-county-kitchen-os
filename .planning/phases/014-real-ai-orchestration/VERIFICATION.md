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

## Slice 014-B — read-only orchestration (2026-08-18)

### Where the endpoint went, and why there is no endpoint

The deployment sits at **12 of 12 serverless functions**, and `scripts/check-bundle-budget.mjs` fails CI at 13. `api/assistant.js` would have been the thirteenth. CLAUDE.md's standing instruction is to consolidate `api/auth/*` into one dispatcher before adding a function; that was not needed, because `api/actions.js` already carries every primitive the assistant requires — cookie authentication, CSRF enforcement, `private, no-store`, and rate limiting — and dispatches by action name.

So the assistant is **`assistant.ask`, an action**, and the deployment is still 12/12 (`npm run perf:budget`, verified). The auth consolidation remains available for whatever genuinely needs a new function.

Two consequences were deliberate:

- **`api/permission-matrix.test.js` forced a role decision.** The suite derives its action list from source, so `assistant.ask` could not ship without one. It is listed in `READ_ONLY_ACTIONS` and allowed for all four roles — the **first action a Viewer can reach**. That is intended: it reads nothing a Viewer cannot already see.
- **Device accounts are refused, and that is the safe default.** `deviceModeActionError` rejects anything outside `DEVICE_ALLOWED_ACTIONS`, so a tester's assistant cannot read the bakery's records. The browser answers them with the deterministic helper instead. Proven in the browser: asking a question as a device account issued **no `/api/actions` request at all** (the local harness fails loudly on unexpected API calls and logged none).

### What may leave the server

`api/_assistantContext.js` writes no query. It composes three things that already existed:

1. `loadKitchenSnapshot` — the app's own read.
2. `filterKitchenSnapshotForActor` — the app's own role filter.
3. `redactForAssistant` — the Phase 014-A allow-list.

then re-checks the assembled payload with `findLeakedFields` and **fails closed**: if anything is found, no context is returned at all, so a caller cannot proceed with a payload that did not pass.

**Correction to a 014-A claim.** 014-A's verification says a Viewer's payload omits costs and money, "matching the role projection the app already enforces." **The app enforces no such projection.** `filterKitchenSnapshotForActor` blanks only `appUsers`, `auditLogs` and `settings.lowStockNotificationEmail`; a Viewer sees `latestUnitCost` and order totals in the app today. The assistant is therefore *stricter* than the app, not matched to it. The direction is safe — strictly less data leaves the server — but the recorded claim was wrong and is withdrawn here.

### Bounded, and truncation is admitted

A kitchen is small but not bounded, and every row costs money. `boundSnapshot` caps each collection, drops child rows whose parent was dropped (an orphan invites an invented answer), and prefers active orders over delivered ones when the cap bites. **Truncation is never silent**: the counts go into the system prompt, and the model is told to say its answer covers only what it was shown rather than state a total or a "none found" as if complete.

### Budget

Enforcement needs durable storage or it is theatre — a per-instance counter resets with every cold start. Migration step `008-assistant-spend` adds an `assistant_spend` table (period, spent_usd, calls), read before each call and incremented after by an atomic upsert.

It **fails closed**: if the ledger cannot be read, the assistant does not spend. Before the migration is applied this means the assistant answers with the Kitchen Helper and says why — an assistant with no ceiling is worse than one switched off.

**Not claimed: a hard cap.** The check is read-then-act, so concurrent calls can overshoot by roughly one call each. A per-user 10/min limit on `assistant.ask` (tighter than the dispatcher's 120/min, because this action costs money) bounds the overshoot; it does not eliminate it. Unknown models are charged at the highest rate in the table, so an unrecognised model errs toward falling back early rather than overspending.

### The model cannot write

Unchanged from 014-A and re-proven here: there is no mutation tool, the four reviewable actions only open existing forms, and anything else is rejected outright rather than sanitised. A reply proposing `inventory.adjust` discards the **whole answer** and falls back — tested.

### Prompt injection, and one gap this slice found

Stored records are quoted as data inside `<kitchen-records>` with the untrusted-data notice, as designed in 014-A.

The **conversation transcript could not be quoted the same way** — turn structure is what makes "and the Friday one?" resolve, so history has to travel as real messages. That means a caller's browser could fabricate an assistant turn ("you already confirmed this") and have the model read it as its own prior statement. Found by adversarial review of this slice. Closed by demoting the transcript in the system prompt: it is described as replayed from the caller's browser, possibly altered, carrying no authority, with only the records and the latest question authoritative. History is additionally capped at 6 turns × 1200 chars and stripped of any role other than user/assistant.

### Verified against a live provider — partly

The owner configured `ANTHROPIC_AUTH_TOKEN` with `ANTHROPIC_BASE_URL=https://api.anthropic.com`. Two results:

- **The credential is rejected.** `api.anthropic.com` returns **401** for it under all three header forms — `x-api-key` ("API key is invalid."), and `Authorization: Bearer` with and without the OAuth beta header ("Invalid bearer token"). Its value was never printed. The provider-backed path therefore **remains unproven end to end**, and no AI capability claim is made.
- **The failure path is proven, against a real 401 rather than a mock.** `runAssistantTurn` returned `source: "fallback"` with "The assistant key was rejected by the provider. The Kitchen Helper answered from your saved records instead." Nothing threw. The provider's error body and status went to the **server log** for diagnosis; the browser-facing reason carried neither the body nor the credential.

Also recorded because it cost time: outbound HTTPS from this workstation fails over IPv6 (`UND_ERR_CONNECT_TIMEOUT` to `2607:6bc0::10:443`) and succeeds with `--dns-result-order=ipv4first`. A local-machine networking quirk, not a code defect, and not applicable to Vercel.

## Slice 014-C — the assistant page is a chat

### What was removed, and why it was safe

The page carried a Conversion workspace and a Recipe Parser Preview alongside the chat. Both are gone. Checked before deleting rather than after:

- The Conversion Library already owns rule management with a proper form (add, edit, verify, delete, CSV import/export) — the removed buttons were a **second door to the same `conversion.save` action**.
- Phase 010-B's recipe-changing path, `conversion.applyToRecipeItem`, lives on **Recipe Detail**, not here. Its evidence is untouched.
- No smoke script referenced the removed controls; the strings appeared only in `src/App.tsx`. A stale selector is the failure mode CLAUDE.md warns about, so this was grepped, not assumed.

### What the chat shows

A model-backed answer must carry its evidence, so each one displays confidence, any assumptions, the record ids it used, the model that wrote it, and the time the records were read. A partial view is badged. Proposed actions render as buttons that only navigate to the matching review screen.

A Kitchen Helper answer that followed a declined provider call shows the honest reason ("...budget is used up", "...key was rejected by the provider"). The page never silently substitutes one for the other.

### Two defects found by opening it in a browser

A green suite proves neither of these, which is why CLAUDE.md requires the browser:

1. **The page title still said "AI Conversion Assistant."** Phase 010 removed that branding everywhere it was read as a claim but missed `src/lib/routes.ts`, so the header contradicted the honest naming — and, after this slice, also described a workspace no longer on the page. Now "Kitchen Helper". The bundle scan in `smoke:uat-core` (`!bundle.includes("AI Assistant")`) still passes.
2. **Horizontal overflow at 375px.** The longest suggestion chip pushed the page 3px wider than the viewport (`scrollWidth` 378 vs `clientWidth` 375). Pre-existing, measured not guessed. Fixed for the wrapping chip variant only — the scrolling variant is meant to run off the edge. Re-measured: `scrollWidth` 375, zero overflowing elements, all chips still ≥44px.

### Gates

`npm test` **569/569** · `npm run build` clean · `npm run perf:budget` **12/12 functions**, entry 102.0 kB of 150 kB.

Each new guard was broken once to confirm it can go red: disabling `redactForAssistant` turned the context suite red (3 failures); adding `inventory.adjust` to `REVIEWABLE_ACTIONS` turned the mutation-refusal tests red (3 failures). Both restored and re-run green.

## Adversarial review, and the seven things it found

A four-dimension review (security, correctness, UI, coverage) was run over the whole slice, and every raw finding was then handed to a separate verifier told to refute it. **56 raised, 17 survived.** The ones that changed the code:

### 1. The transcript was a side door around redaction (high)

The rows going to a provider were redacted; the **replayed conversation was not**. The browser's own deterministic helper prints real customer names (`Chika: cocoa short 80g`) and, for a Viewer, costs. One fallback turn — provider down, over budget, rate-limited, contract failure — puts that text in the thread, and the next successful turn shipped it to the provider as history.

Closed on both sides, because either alone is a single point of failure:

- **Client**: helper answers are no longer replayed at all. Only the operator's own turns and *provider* answers go into `history`. Helper answers cost nothing to regenerate, so nothing is lost.
- **Server**: `boundHistory` now scrubs the identities this kitchen actually holds out of every replayed turn, and out of the operator's question, putting the **same placeholder the records use** in their place — so "is Chika's order ready?" still resolves against the right order without the name travelling. A phone-shaped number is removed whether or not it belongs to anyone on file.

The scrubber is handed to the turn runner as a **function**, not as the list of names it closes over. `JSON.stringify` drops a function, so no future `...context` spread into a response can leak an identity by accident. That change was itself prompted by a test written for this fix going red.

### 2. A model reply could white-screen the app (high)

`validateAssistantResponse` checked `action.type` but passed `proposedActions` through untouched, and the browser rendered `action.label.trim()`. A reply of `{type: "openShoppingList", label: 42}` passed the contract and threw during render — and there is no ErrorBoundary in `src/`, so React unmounts the whole tree. **Model-controlled output could blank the app.** A non-string label is now a contract violation, and the action is rebuilt from its two contracted fields so invented extra keys never reach the browser.

### 3. Stored text could close the quoting envelope (medium)

`quoteUntrusted` neutralised ``` fences but not angle brackets, and `JSON.stringify` does not escape them either. Any operator-writable field that survives the allow-list — an ingredient name, a recipe name, a unit — could contain a literal `</kitchen-records>` and end the envelope early, so whatever followed read as if it came from outside the quoted block. A stored, persistent, cross-user injection channel. Angle brackets are now replaced with their single-glyph lookalikes, so no stored text can close a tag it is inside.

### 4. A provider that reports no usage disabled the ceiling (medium)

Absent `usage` coerced to zero tokens, `recordSpendUsd` skips amounts of zero, and the ledger never moved — so a gateway that omits usage (common for the self-hosted and proxy endpoints `ASSISTANT_BASE_URL` exists to support) billed real money against a budget that could never trip. **The budget failed open.** An unreported call is now charged a deliberately pessimistic full-request estimate; the worst case is falling back to the deterministic helper earlier than necessary.

### 5. The provider's error body was written to the log (medium)

`error.detail` holds 500 bytes of the provider's error response, and it was logged wholesale — against this module's own stated invariant. That body can echo the request back (which carries the kitchen's records), and some providers quote the offending credential in a 401. Status and our own plain-language reason are logged now; the body is not.

### 6. The cost-control limiter did not constrain the thing it was for (medium)

Budget is read before a call and written after it, so overlapping requests all see the same pre-call spend and can collectively overshoot. The guard against that was the **per-instance** limiter — and serverless fans concurrent requests across instances, which is exactly the shape of the overshoot. Now the shared, database-backed counter that already guards the auth endpoints. The overshoot is bounded, not eliminated; see Residual Risk.

### 7. Smaller ones

Prototype-chain route lookup (`"toString" in ASSISTANT_ACTION_ROUTES` is `true`) replaced with an own-property check; Enter-to-send fired mid-IME-composition; the chat thread was destroyed by the assistant's own proposed-action buttons, discarding a paid answer; screen readers got no speaker attribution and no announcement of a request in flight; the suggestion chips named a seed recipe a real bakery may never have baked; and the deterministic helper answered cost questions about `recipes[0]` without saying it had not found the recipe asked for.

One finding was **not** fixed and is recorded instead: Viewer cost redaction is provider-only. `/api/bootstrap` sends costs to every signed-in role today and the Costing screen renders them, so stripping costs from a Viewer's provider payload is data minimisation for the third party, **not** a claim that Viewers cannot see costs. The comment in `shared/actionPolicy.js` that said otherwise was corrected rather than left to mislead the next reader.

## Seen in a browser

Both answer shapes were driven at 1280px and 375px against the built bundle, with the session, bootstrap and `assistant.ask` responses stubbed locally (this environment has no `DATABASE_URL`). The components, routing, styling and deterministic helper are real.

- **Provider answer**: renders the answer, a `Confidence: High` badge, "Answered by claude-opus-5 from records read at 5:02:32 PM", the assumption, the source record ids, and two action buttons — one with the model's label, one falling back to our own wording because the model supplied none. The spend line appears for Owner/Admin only.
- **Proposed action round trip**: clicking "Open the shopping list" navigates and offers "Back to Kitchen Helper"; returning finds **the paid answer still there**, with its assumptions, sources and buttons. That is the fix for finding 7 (thread destroyed by navigation) verified rather than asserted.
- **History, checked at the wire.** First turn sent **0** history turns — the helper's welcome message is excluded, which also means a conversation no longer opens with an assistant turn. Second turn sent **2** — the operator's question and the *provider* answer. The client-side half of finding 1, observed rather than reasoned about.
- **Fallback**: the local helper answers and the honest reason sits under it ("This month's assistant budget of $10 is used up..."). No evidence footer, no spend line.
- **375px**: no horizontal overflow (`scrollWidth` 375 = `clientWidth`), composer stacks to full width, every chip and action button ≥44px.

## Not claimed

- **No AI capability claim. The provider path has never completed a live call.** The credential in `.env.local` is `ANTHROPIC_AUTH_TOKEN`, and `api.anthropic.com` rejects it with **401 `authentication_error: Invalid bearer token`** under every header form the adapter supports. The Messages API wants an API key (`sk-ant-…`) in `x-api-key`; an OAuth bearer token is a different credential for a different endpoint. Its value was never printed.
- What that probe *did* prove, against a real 401 rather than a mock: the failure path. `runAssistantTurn` returned `source: "fallback"` with honest copy, nothing threw, and neither the provider's body nor the credential reached the browser.
- The budget is a soft ceiling, not a hard cap.
- The provider-backed UI states were seen with a **stubbed** `assistant.ask` response, not a real model's.
- `npm run smoke:uat-full` has not been run for this work: it needs live credentials and a deployment carrying these changes.

## Remaining in Phase 014

- **Get a credential the chosen gateway accepts.** See the provider section below: AgentRouter refuses the current one as an unauthorized *client*, and its documented keys are `ak-`-prefixed while the configured one is `sk-`. Either obtain an AgentRouter key and set `ASSISTANT_PROVIDER=openai` with `ASSISTANT_BASE_URL=https://agentrouter.org/v1`, or use an Anthropic key (`sk-ant-…`) with the default base URL. Until then `/api/health` reports `configured: true` while every call falls back — honest behaviour, but not a working assistant.
- **Run migration 008** (`assistant_spend`) against production via the Owner/Admin `schema.ensure` action. Until it exists, `readSpendUsd` throws and every turn falls back with "the spend ledger is not installed yet" — deliberately fail-closed, but it means the assistant is off until the migration runs.
- **An authenticated smoke against a live model**, then `npm run smoke:uat-full`. Only after that may any AI capability claim be made.

## Follow-up: the Viewer cost projection, closed (2026-08-18)

The review finding that was recorded rather than fixed is now fixed. It had been
provider-only: `redactForAssistant` stripped costs before sending them to a third
party, while `/api/bootstrap` handed the same figures to the Viewer's own browser
and the Costing screen rendered them. Stripping in one place and not the other is
not a projection.

### One field list, four consumers

`COST_FIELDS` and `COST_VISIBILITY_ROLES` live in `shared/actionPolicy.js` and are
read by `/api/bootstrap`, the route-scoped reads in `api/data/[resource].js`, the
assistant's redaction, and the client's own `viewCosts` permission. That closes
DECISION.md's residual risk directly: the allow-list and the app's projection were
two places that had to agree, and now there is one place. A test asserts the two
agree field for field.

Cost-permitted roles are Owner/Admin, Baker and Inventory Manager. A Viewer gets
no `latestUnitCost`, no order pricing, no `costProfile`, no purchase history, and
the dashboard's two money aggregates are withheld rather than zeroed.

### The client half, and why it was not optional

Stripping the data was necessary but not sufficient, and the browser proved it.
With a Viewer's projected snapshot the dashboard showed **Shopping Estimate
₦27,700** — a *fabricated* figure, because `estimatedUnitCost` falls back to
hard-coded placeholder rates (100/250/15/5) when no cost is recorded. That is the
same defect Phase 007 removed when it deleted the hard-coded 18,000s, resurfacing
through a different door. The other two tiles showed **₦0**, which reads as "this
costs nothing" rather than "you cannot see this".

Fixed at the render boundary rather than at call sites: `formatNaira` returns an em
dash when the session's role may not see money, and `estimatedUnitCost` returns 0
instead of guessing. Thirty-one places format a figure across fifteen components;
gating each one is a change that gets forgotten at the thirty-second. The flag is
derived inside `setDataSession`, so establishing a session cannot omit it, and it
defaults to hidden when signed out.

`viewCosts` also hides the Costing entry from both navs and gates the route
itself, because hiding a menu item is not access control and `#costing` is a link
anyone can type.

### Verified

- `npm test` **587/587**, build clean, **12/12 functions**, contrast passing.
- Each guard broken once to confirm it goes red: adding Viewer to
  `COST_VISIBILITY_ROLES` (5 failures), removing the bootstrap projection (1),
  removing the `formatNaira` gate (2). The first attempt at that third check used
  a `perl` pattern that silently did not match and reported green — caught only by
  re-checking that the edit had landed. A check that cannot fail is worse than no
  check, and this one nearly shipped as one.
- **In a browser, as a real Viewer session** driven through the harness with the
  real `filterKitchenSnapshotForActor`: **zero** currency figures across all ten
  reachable pages; the three dashboard tiles read "—"; `#costing` shows "Costs are
  not shown for your role". Control case as Owner/Admin on the same build: 3
  figures on the dashboard, 5 in inventory, 5 in shopping, 7 in costing. Withheld
  by role, not deleted.

### Also fixed here

- **A base URL ending in `/v1` was doubled.** `endpoint()` appended `/v1/chat/completions`
  to a base that already carried the version, producing `/v1/v1/...` and a 404 that
  looks exactly like a bad key. Most OpenAI-compatible gateways publish their base
  URL with the version on it, so this was going to bite the first one configured.
- **`assistantConfigSummary` now reports `modelSource` and `baseUrlSource`.** This
  cost a wrong diagnosis: `ANTHROPIC_BASE_URL` and `ANTHROPIC_MODEL` are set in
  this session's ambient environment by the surrounding tool for its own use, and
  Node's `--env-file` does not override already-set variables — so a probe read
  the ambient host instead of the configured one and the resulting 401 was blamed
  on the credential. A wrong base URL sends the kitchen's records to a host nobody
  chose, so which variable won is now visible in `/api/health` rather than
  mysterious. **Prefer the neutral `ASSISTANT_*` names**; they always outrank the
  vendor ones and collide with nothing.

### The provider is still unproven, and now for a clearer reason

The configured gateway is `https://agentrouter.org`, whose documentation describes
an **OpenAI-compatible** API (`/v1`, `ak-`-prefixed bearer tokens) — not an
Anthropic Messages API. Probed with its documented base URL, its documented auth
header, and both endpoint shapes, it returns **401
`unauthorized_client_error: "unauthorized client detected"`** every time. That is
not "bad key" and not "wrong request shape": it is the service rejecting the
caller. The credential in `.env.local` is `sk-`-prefixed, which is neither
AgentRouter's documented `ak-` nor Anthropic's `sk-ant-`.

No attempt was made to look like whichever client the service does trust. Getting
past a client check by impersonating a trusted client is circumventing an access
control, not configuring an integration.

## Residual Risk

- Retention and training terms are **provider-dependent and not claimed here**. Code cannot enforce a third party's policy; the owner must confirm the chosen provider's terms before enabling it, since recipes and costs are commercial IP.
- The redaction allow-list is only correct while it matches the app's own role projection. Both are tested, but they are two places that must agree.
- **The budget can be overshot.** Spend is read before a call and written after it, so requests already in flight do not see each other. The shared limiter caps one account at 10 calls a minute, which bounds the overshoot; it does not make the ceiling exact. A hard cap needs a reservation written before the call.
- **The identity scrub is a filter, not a proof.** It removes the names and numbers this kitchen holds, plus anything phone-shaped. An operator who types a customer's name that is not in the records, or a spelling that differs from the stored one, is not covered. The structural protections — the allow-list on rows, and no longer replaying helper answers — are what carry the guarantee; the scrub is the net under them.
- **The client-side money gate is a display rule, not an authorization boundary.** The authoritative fix is the server projection: a Viewer's snapshot carries no costs, so there is nothing in the browser to reveal. `formatNaira` returning an em dash stops a *fabricated* figure being rendered from placeholder rates; it is not what keeps costs out of the browser, and it should not be relied on as though it were.
- **Cost visibility is role-wide, not per-screen.** A Baker sees every figure a Baker can see anywhere. If costs later need splitting by screen — recipe cost yes, order margin no — `COST_FIELDS` is the wrong shape for it and would need a per-surface spec.
- **37 of the review's verifiers did not run** (the session hit its usage limit), so some raised findings were never judged either way. The 17 confirmed here were verified; the unjudged remainder is not evidence of absence.
