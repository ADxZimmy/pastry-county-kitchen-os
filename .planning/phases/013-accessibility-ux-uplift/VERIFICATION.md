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

## Remaining in Phase 013

Steps 4–8 of the plan are UX improvements rather than accessibility defects, and none is currently failing a check:

- Recipes into the primary mobile nav; More menu reshuffle (needs `smoke:navigation-routing` expectations updated in the same change).
- Dashboard metric cards deep-linking to filtered lists.
- List-state preservation (search/filter/page/scroll/expanded) across detail round-trips.
- Mobile production card scan hierarchy.
- Builder form ergonomics: collapsible ingredient rows, duplicate action, sticky Add ingredient, item count.

Step 10 (manual keyboard-only walkthrough and an NVDA/VoiceOver pass, recorded with assistive-technology versions) is **owner work** — automated checks cannot substitute for it, and no screen-reader claim is made here.

## Residual Risk

- Automated axe coverage catches roughly half of real accessibility defects. The clean sweep is necessary, not sufficient, and the manual pass above remains outstanding.
- Contrast is checked at the token level. A component that hardcodes a colour instead of using a token would not be caught; the decorative login gradient is the one known hardcoded value.
- Coverage is the five main routes plus login. Modals, forms and detail pages are not yet swept.
- Risk: automation cannot prove screen-reader clarity or real virtual-keyboard behavior.
  Owner: Phase 013 manual UAT.
