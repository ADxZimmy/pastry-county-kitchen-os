# Verification

## Slice 013-A — contrast, legibility, and an accessibility gate (deployed 2026-07-19, commits `a6189a6`, `d94fdfb`)

### The audit's claim, measured rather than assumed

`scripts/check-contrast.mjs` computes WCAG ratios from the real `:root` tokens — not a copied table, so it cannot drift from what the app renders.

| Pair | Before | After | Needs |
|---|---|---|---|
| link (caramel) on page background | **3.92:1** | **4.68:1** | 4.5:1 |
| link (caramel) on surface | **4.03:1** | **4.81:1** | 4.5:1 |
| bottom-nav label size | **10.5px** | **11.5px** | ≥ 11px |

PCO-013 confirmed: the link colour genuinely failed AA for normal text, and nav labels were below the legibility floor.

Every other pair in the palette already passed (body 16.4:1, muted 7.7:1, accent 5.6:1, amber 4.55:1, green 6.1:1, red 6.2:1) and is now pinned so a future palette change cannot quietly regress it.

### The fix

`--caramel` moves from `#c26116` to `#af5714`. The nearer candidate `#b25914` (4.54:1) was rejected for sitting on the line, where any later tweak reopens the defect. Verified the token is used only for link text, a form `accent-color`, and a chart fill — never as a background behind dark text — so darkening it cannot harm anything else. Nav labels go to 11.5px at weight 700.

Confirmed live in the deployed stylesheet: `--caramel:#af5714` and `font-size:11.5px`. One `#c26116` remains in a decorative login gradient at 36% alpha; it is a background wash rather than text, so no contrast rule applies, and it is recorded here rather than silently ignored.

### Gates added

- **CI**: `npm run a11y:contrast` runs on every push and pull request, so a palette change that dims text below AA fails review instead of shipping.
- **`npm run smoke:a11y`**: drives the real app for what a token check cannot see.

### Live result: **25/25 passed**

- axe-core WCAG 2 A/AA sweep, serious and critical only: **clean on Login, Dashboard, Inventory, Orders, Production, Recipes**.
- Every control on every route has an accessible name; login fields are all labelled.
- Focus indicators present on all routes.
- Skip-to-content link present.
- No horizontal overflow and nav labels ≥ 11px at **360, 390 and 414px** — the three widths the audit named.

### A check that was passing for the wrong reason

The pointer-only row check originally looked for `tr[onclick]`. React attaches handlers as synthetic events and never writes that attribute, so it could not have detected the pattern the audit flagged — it was a false pass on the exact finding it was meant to cover.

It now looks for the observable signal: a row styled `cursor: pointer` that contains nothing focusable. The result is still zero, but it is now evidence rather than an artefact of a selector that could never match. Earlier phases had already put real `<Button>` controls inside rows, which is why the app genuinely passes.

If axe-core is unavailable the sweep reports itself as **skipped**, never as passed.

## Slice 013-B — navigation and dashboard deep links (deployed 2026-07-19, commit `df8ba52`)

### Mobile navigation (plan step 4)

The five primary slots now hold the daily operating loop — **Recipes, Inventory, Orders, Production** — instead of burying Recipes two taps deep in the More sheet. Dashboard moved to the top of that sheet: it is the post-login landing page, so it is seen every session anyway, whereas a baker reaches for a recipe constantly.

`smoke:navigation-routing` was updated in the same change and now additionally asserts Dashboard is still reachable from More, so the relocation cannot quietly strand it.

### Dashboard deep links (plan step 5)

Metric cards were counts with no way through. Each card naming an actionable list now opens it, filtered where the destination supports it:

| Card | Opens |
|---|---|
| Total Ingredients | Inventory |
| Low Stock Items | Inventory **filtered to Low Stock** |
| Orders Due Today | Orders |
| Pending Production | Production plan |
| Shopping Estimate | Shopping list |
| Notifications | *(inert — no single destination)* |

The filter travels in the URL (`#/inventory?filter=Low%20Stock`), so a filtered list is shareable and a card can link straight to it; Inventory seeds its filter from the route.

Cards that lead somewhere are real `<button>`s — keyboard-operable, with an `aria-label` stating both the number and the destination. Cards without a destination stay inert `<article>`s rather than pretending to be interactive, which is exactly the pointer-only pattern 013-A added a check for.

### Verification

- `npm.cmd run smoke:navigation-routing` — passed with the new layout.
- `npm.cmd run smoke:a11y` — **25/25**, axe still clean on Dashboard after the cards became buttons, and still zero pointer-only rows.
- `npm.cmd run smoke:live-audit` — all 7 browser smokes passed.
- `npm.cmd test` — 234/234. Contrast gate green.

## Remaining in Phase 013

Plan steps 6–8, all UX polish rather than defects, none failing a check:

- List-state preservation (search/filter/page/scroll/expanded) across detail round-trips. The route now carries a filter for Inventory and Orders, which is the groundwork for this.
- Mobile production card scan hierarchy.
- Builder form ergonomics: collapsible ingredient rows, duplicate action, sticky Add ingredient, item count.

Step 10 (manual keyboard-only walkthrough and an NVDA/VoiceOver pass, recorded with assistive-technology versions) is **owner work** — automated checks cannot substitute for it, and no screen-reader claim is made here.

## Residual Risk

- Automated axe coverage catches roughly half of real accessibility defects. The clean sweep is necessary, not sufficient, and the manual pass above remains outstanding.
- Contrast is checked at the token level. A component that hardcodes a colour instead of using a token would not be caught; the decorative login gradient is the one known hardcoded value.
- Coverage is the five main routes plus login. Modals, forms and detail pages are not yet swept.
- Risk: automation cannot prove screen-reader clarity or real virtual-keyboard behavior.
  Owner: Phase 013 manual UAT.
