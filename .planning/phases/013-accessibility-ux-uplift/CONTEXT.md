# Context

## Goal

Close the accessibility gaps (contrast, keyboard-operable rows, nav label size) and the highest-value mobile/desktop UX findings from audit sections E and F. Closes audit finding PCO-013 and the actionable E/F items.

## Relevant Files

- Path: src/index.css / styles in index.html bundle
  Why it matters: Caramel link color ~4.03:1 on warm surface (below 4.5:1 AA); bottom-nav labels ~10.5px.
- Path: src/App.tsx (ResponsiveTable, clickable rows)
  Why it matters: Row click targets are not keyboard-operable links/buttons; audit requires real links or labelled View actions.
- Path: src/App.tsx (mobile bottom nav config)
  Why it matters: Recipes sits under More while Dashboard holds a primary slot; operators move between Recipes and Production constantly.
- Path: src/App.tsx (Dashboard metric cards)
  Why it matters: Cards are informational; audit wants them to open the corresponding filtered list (low stock -> Inventory filtered, pending orders -> Orders filtered, today's production -> Production, shopping cost -> Shopping).
- Path: src/lib/routes.ts
  Why it matters: Filtered-list deep links and list-state restoration (search, filter, page, scroll) ride on the route model.

## Decisions

- Decision: Use the ui-ux-pro-max skill during implementation for palette/contrast choices and mobile hierarchy, per global preferences.
  Reason: Mandatory for UI/UX work; also grounds color changes in a checked contrast system.
- Decision: Promote Recipes into the five-item mobile nav (Dashboard moves under More or becomes the home logo target).
  Reason: Audit section E; recipe/production ping-pong is the operator's core loop. Configurable-by-role nav stays post-MVP.
- Decision: Convert clickable rows/cards to real anchors on the record name plus a labelled View action; whole-row click stays as a convenience but not the only path.
  Reason: PCO-013 keyboard operability without sacrificing touch ergonomics.
- Decision: Preserve list context (search term, filters, page, scroll, expanded row) across detail navigation using route state.
  Reason: Audit section F; also improves the mobile flow.
- Decision: Strengthen mobile production card scanning hierarchy: due time, quantity, shortage, status, action visible without opening the card.
  Reason: Audit section E - the operator should identify the next batch within seconds.

## Risks

- Risk: Contrast fixes can drift the visual identity.
  Mitigation: Adjust tokens minimally to reach 4.5:1; verify with the dataviz/ui-ux contrast validators before applying.
- Risk: Nav rearrangement invalidates navigation smoke expectations.
  Mitigation: Update smoke:navigation-routing in the same change.
- Risk: Keyboard/screen-reader verification requires manual passes.
  Mitigation: Scripted keyboard-only walkthrough checklist in UAT.md at 360x800, 390x844, 414x896 plus desktop; record results, not assumptions.
