# Plan

## Outcome

Pastry County Kitchen OS has a coherent navigation system instead of disconnected task pages. Users can move from lists to details to edit/create/scale flows, return naturally, use browser Back, refresh or share record URLs, and recover from every page without losing context. Mobile navigation stays compact and predictable.

## Scope

Included:

- Audit every app page, primary button, row/card click, shortcut, modal trigger, and cross-feature jump for navigation intent and escape behavior.
- Replace page-only hashes with a typed, record-aware route model.
- Serialize durable routes into hashes, for example `#recipes`, `#recipes/<recipeId>`, `#recipes/<recipeId>/edit`, `#recipes/<recipeId>/scale`, `#inventory/<ingredientId>`, `#inventory/<ingredientId>/edit`, `#orders/<orderId>`, and `#orders/<orderId>/edit`.
- Keep legacy hashes working long enough to avoid breaking saved sessions.
- Add a central `navigate`, `replaceRoute`, and `goBack` model with optional return context.
- Add breadcrumbs or explicit Back actions on detail, form, scaling, order-create/edit, shopping-from-shortage, and other durable task surfaces.
- Replace static `FormShell cancelTo` behavior with route-aware return targets and clearer button labels.
- Add unsaved-change protection for forms and browser/tab navigation.
- Rework mobile primary navigation to five or fewer bottom items with More for secondary modules.
- Preserve filters/search where reasonable when moving list -> detail -> back.
- Add route and navigation unit tests.
- Add a dedicated Playwright navigation/routing smoke and include it in the umbrella live audit once stable.

Excluded:

- Replacing React or Vite.
- Replacing the app with Next.js or a full router library unless the implementation proves it is safer than typed hash routes.
- Backend schema changes.
- Broad visual redesign unrelated to wayfinding, hierarchy, or navigation controls.
- Legal/compliance certification evidence work.

## Route Model

Target route shape:

```ts
type AppRoute =
  | { name: "welcome" }
  | { name: "login" }
  | { name: "dashboard" }
  | { name: "recipes"; recipeId?: string; mode?: "detail" | "new" | "edit" | "scale" }
  | { name: "inventory"; ingredientId?: string; mode?: "detail" | "new" | "edit" }
  | { name: "orders"; orderId?: string; mode?: "detail" | "new" | "edit" }
  | { name: "production"; orderId?: string; batchId?: string }
  | { name: "shopping"; returnTo?: AppRoute }
  | { name: "costing"; recipeId?: string; returnTo?: AppRoute }
  | { name: "ai" }
  | { name: "conversions"; ruleId?: string }
  | { name: "suppliers"; supplierId?: string }
  | { name: "settings"; section?: string };
```

Implementation may refine names, but it must preserve these principles:

- Durable record views include IDs in the URL.
- Task routes know their parent and their return target.
- Unknown or missing records resolve to a safe not-found state with a parent-list escape.
- Browser history records meaningful user steps.
- Existing `Page` names become compatibility aliases, not the long-term source of truth.

## Steps

1. Step: Complete the navigation inventory.
   - Build a source-backed list of every `setPage`, card click, row click, toolbar action, form cancel/save, modal trigger, and cross-feature shortcut in `src/App.tsx`.
   - Mark each as top-level navigation, child-detail navigation, task/form navigation, modal action, destructive action, or cross-feature jump.
   - Record desired back target and save/cancel target for each.

2. Step: Add typed route helpers.
   - Add parse/serialize helpers for the new hash route shape.
   - Add compatibility parsing for current hashes such as `#recipe-detail`, `#recipe-form`, `#ingredient-detail`, `#ingredient-form`, `#order-create`, and `#order-detail`.
   - Add route parent and route title helpers.
   - Add unit tests for route parsing, serialization, fallback, missing IDs, and parent targets.

3. Step: Introduce route-aware navigation state.
   - Replace page-only state as the primary source with `AppRoute`.
   - Keep selected IDs as derived compatibility values during the migration if needed.
   - Update session persistence to save the route, not only the page slug.
   - Ensure signed-out routes still fall back to Login or Welcome safely.

4. Step: Add global wayfinding controls.
   - Add a small page header area for breadcrumb/back controls on child routes.
   - Use predictable labels such as `Back to Recipes`, `Back to Inventory`, `Back to Order`, and `Back to Production`.
   - Keep top-level module pages focused and avoid extra chrome where not needed.

5. Step: Migrate Recipes workflows.
   - Recipes list -> recipe detail uses `#recipes/<recipeId>`.
   - Add Recipe uses `#recipes/new`; Cancel returns Recipes; Save goes to new recipe detail if the API returns or can infer the created record, otherwise Recipes with a toast.
   - Edit Recipe uses `#recipes/<recipeId>/edit`; Cancel and Save return recipe detail.
   - Scaling uses `#recipes/<recipeId>/scale`; Back returns recipe detail.
   - Create Order from recipe/scaling carries a return target.

6. Step: Migrate Inventory workflows.
   - Inventory list -> ingredient detail uses `#inventory/<ingredientId>`.
   - Add Ingredient uses `#inventory/new`; Cancel returns Inventory; Save goes to new ingredient detail if possible, otherwise Inventory.
   - Edit Ingredient uses `#inventory/<ingredientId>/edit`; Cancel and Save return ingredient detail.
   - Stock adjustment remains a modal with current focus/escape behavior.

7. Step: Migrate Orders and Production workflows.
   - Orders list -> order detail uses `#orders/<orderId>`.
   - Add Order uses `#orders/new`; Edit Order uses `#orders/<orderId>/edit`.
   - New order from Recipe/Scaling carries a return target for Cancel and a sensible post-save target.
   - Production shortage jumps to Shopping with visible `Back to Production` or `Back to Order` context.
   - Production cards that open order detail preserve Production as a return source where useful.

8. Step: Audit and migrate secondary modules.
   - AI shortcut buttons should navigate with return context or open inline results when a module switch would be disruptive.
   - Costing, Conversions, Suppliers, and Settings should keep their current working patterns where they are already modal/inline, while adding route state for meaningful subsections or selected records if needed.
   - More menu should not hide the user's current location or trap focus.

9. Step: Fix mobile navigation.
   - Limit bottom navigation to five or fewer primary items.
   - Put secondary modules behind More.
   - Verify active states, labels, touch targets, safe-area padding, 320px fit, and no horizontal overflow.

10. Step: Add form recovery and guards.
    - Add unsaved-change detection to `FormShell` and route changes.
    - Ensure Cancel, Back, top nav, bottom nav, browser Back, and tab close are handled consistently.
    - Keep errors and saving states visible without trapping the user.

11. Step: Verify locally.
    - Run `npm.cmd test`.
    - Run `npm.cmd run build`.
    - Run `node --check scripts/navigation-routing-smoke.mjs`.
    - Run `git diff --check`.

12. Step: Ship and verify production.
    - Commit and push after local implementation.
    - Wait for Vercel to serve the new frontend bundle.
    - Run `npm.cmd run smoke:navigation-routing` against production.
    - Run `npm.cmd run smoke:live-audit` after the dedicated navigation smoke passes.

## Verification

- Check: Route helper tests.
  Expected: New route hashes parse and serialize deterministically; legacy hashes remain safe; unknown hashes fall back without stale content.

- Check: Record deep links.
  Expected: Direct links to recipe, ingredient, and order detail pages load the correct record after refresh or show a safe not-found state.

- Check: Recipes navigation smoke.
  Expected: Recipes -> Detail -> Edit -> Cancel returns Detail; Edit -> Save returns Detail; Detail -> Scale -> Back returns Detail; browser Back follows the same path.

- Check: Add Recipe navigation smoke.
  Expected: Recipes -> Add Recipe -> Back/Cancel returns Recipes; typed unsaved data triggers a guard before leaving.

- Check: Inventory navigation smoke.
  Expected: Inventory -> Ingredient Detail -> Edit -> Cancel/Save returns Ingredient Detail; Add Ingredient Cancel returns Inventory.

- Check: Orders navigation smoke.
  Expected: Orders -> Order Detail -> Edit -> Cancel/Save returns Order Detail; Add Order Cancel returns Orders; create order from recipe/scaling preserves source context.

- Check: Production shortage route.
  Expected: A shortage jump opens Shopping with a visible return action back to Production or the affected order.

- Check: Mobile navigation.
  Expected: Bottom nav has no more than five primary items, active state is correct, controls remain 44px or larger where interactive, and 320/360/390/414/430px viewports have no horizontal overflow.

- Check: Accessibility.
  Expected: Keyboard users can navigate breadcrumbs, Back, Cancel, Save, nav bars, More menu, and modals; focus is not lost after route changes or modal close.

## Rollback

The planned change is frontend-routing only. If a deployment exposes unexpected navigation regressions, rollback can restore the previous page-only hash handling without database migration. Keep compatibility parsing isolated so it can be retained even if deeper route-aware UI changes are reverted.
