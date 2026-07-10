# Plan

## Outcome

All text meets WCAG AA contrast, every interactive row is keyboard-operable, mobile nav prioritises the operator loop with legible labels, dashboard cards deep-link to filtered lists, and list context survives detail round-trips. PCO-013 closed; audit E/F actionables shipped.

## Scope

Included:

- Link color contrast fix to >= 4.5:1; bottom-nav label size >= 11-12px with contrast check.
- Keyboard-operable record rows (real anchors + labelled View actions) across ResponsiveTable and card lists.
- Recipes promoted into the five-item mobile nav; More menu reshuffled.
- Dashboard metric cards deep-linking to filtered Inventory/Orders/Production/Shopping views.
- List-state preservation (search, filter, page, scroll, expanded row) for Recipes, Inventory, Orders.
- Mobile production card hierarchy: due time, quantity, shortage, status, action visible at a glance.
- Collapsible ingredient rows, duplicate-row action, sticky Add ingredient, and item count in long builder forms.
- Keyboard-only and screen-reader verification passes recorded in UAT.md; real mobile keyboard checks at 360/390/414 widths.

Excluded:

- Configurable per-role navigation (post-MVP).
- Desktop density/table redesign beyond linked rows (post-MVP unless trivial during row work).

## Steps

1. Run ui-ux-pro-max searches for contrast-safe warm palette adjustments and mobile nav hierarchy; lock token changes.
2. Adjust CSS tokens: caramel link color to >= 4.5:1 on warm surfaces; bottom-nav font size/weight; re-verify focus styles unaffected.
3. Refactor ResponsiveTable rows and card lists: record name becomes a real link (routes.ts href), add labelled View buttons, ensure focus order and Enter/Space activation; keep row-click convenience.
4. Update mobile nav: Recipes into primary five; Dashboard relocation; update More sheet; adjust smoke:navigation-routing expectations.
5. Add filter-aware deep links from dashboard cards (low stock, pending orders, today's production, shopping cost) using existing route params or new ones in routes.ts.
6. Implement list-state preservation via route state (search/filter/page/scroll/expanded) for Recipes, Inventory, Orders; restore on back navigation.
7. Rework mobile production cards for scan hierarchy (due time, quantity, shortage badge, status, primary action) with ui-ux-pro-max guidance.
8. Builder form ergonomics: collapsible ingredient rows with summary line, duplicate action, sticky Add ingredient, item count indicator.
9. Manual verification: keyboard-only full workflows (login -> create recipe -> order -> production) and a screen-reader pass; Android/iOS keyboard behavior at 360x800, 390x844, 414x896; record in UAT.md.
10. Run tests, build, navigation smoke, and umbrella smoke.

## Verification

- Check: Contrast measurements for links and nav labels
  Expected: >= 4.5:1 (normal text) in both themes/surfaces used.
- Check: Keyboard-only walkthrough
  Expected: Every record reachable and openable without a pointer; visible focus throughout.
- Check: `npm.cmd run smoke:navigation-routing`
  Expected: Pass with new nav layout and deep links.
- Check: Dashboard card taps
  Expected: Land on correctly filtered lists.
- Check: Back from detail
  Expected: Search/filter/page/scroll restored.

## Rollback

Pure frontend; revert the commit. Route param additions are additive to routes.ts.
