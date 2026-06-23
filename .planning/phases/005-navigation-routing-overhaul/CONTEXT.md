# Context

## Goal

Fix the app's page-per-action navigation model. The current experience lets users reach important task pages, but many of those pages behave like dead ends: edit forms, create flows, recipe scaling, and cross-feature shortage paths often have only save/cancel exits and no durable route hierarchy, breadcrumb, browser Back behavior, or return context.

## User Finding

The owner flagged this as a critical product issue on 2026-06-23:

- Navigation feels absent rather than merely incomplete.
- Actions such as saving ingredients and adding recipes have their own full pages.
- From Recipes -> Add Recipe, the user cannot naturally go back except by Save or Cancel.
- Recipe forms and other forms are page peers instead of contextual flows.
- The routing/navigation model needs an intensive audit across every page and every button.

## Skill Inputs

- GSD Hybrid was used to structure this as a phase with context, plan, UAT, and verification artifacts.
- UI UX Pro Max guidance was used for navigation, wayfinding, escape routes, bottom navigation limits, back behavior, direct links, form recovery, keyboard access, and mobile interaction expectations.

Note: The installed UIUX skill root exists at `C:\Users\User\.codex\skills\ui-ux-pro-max\SKILL.md`. Its `scripts` and `data` entries are pointer files, not folders. They point to `C:\Users\User\src\ui-ux-pro-max\scripts` and `C:\Users\User\src\ui-ux-pro-max\data`, but both targets are missing in this environment. This phase therefore uses the available `SKILL.md` guidance directly.

## Relevant Files

- Path: `src/App.tsx`
  Why it matters: The `Page` union, hash parsing, `setPage` navigation, selected record IDs, desktop/mobile nav, form shells, details, modals, and page switch all live here.

- Path: `src/styles.css`
  Why it matters: Navigation shell, mobile bottom nav, sticky actions, page headers, form layout, responsive overflow, and touch targets are styled here.

- Path: `src/App.test.ts`
  Why it matters: Existing route fallback tests live here; Phase 005 needs route parse/serialize/back-target tests.

- Path: `scripts/milestone7-smoke.mjs`
  Why it matters: Existing live smoke coverage includes several mobile workflow checks and can provide Playwright patterns.

- Path: `scripts/regression-audit-smoke.mjs`
  Why it matters: Existing production regression smoke pattern for authenticated browser and mutation checks.

- Path: `scripts/phase3-pastry-smoke.mjs`
  Why it matters: Pattern for authenticated temporary recipe workflow smoke.

- Path: `scripts/phase4-pastry-depth-smoke.mjs`
  Why it matters: Pattern for production workflow smoke that creates and archives temporary data.

- Path: `scripts/live-audit-smoke.mjs`
  Why it matters: Umbrella production smoke; Phase 005 navigation coverage should be added after it stabilizes.

- Path: `docs/new-chat-context.md`
  Why it matters: New chats should know that navigation/routing is now the active product risk despite the prior 96/100 audit.

## Current Navigation Model

- `src/App.tsx` uses a string `Page` union where top-level modules and subflow/task screens are peers: `recipes`, `recipe-detail`, `recipe-form`, `scaling`, `inventory`, `ingredient-detail`, `ingredient-form`, `orders`, `order-create`, `order-detail`, and other modules all sit at the same level.
- Hash routing stores only page names, such as `#recipes` and `#recipe-detail`.
- Selected record IDs are held separately in React state and localStorage, not in the URL. Direct detail/form hashes can therefore be stale, arbitrary, or not shareable.
- Browser history only sees page slugs. It does not know whether the user came from a list, detail page, scaling flow, production shortage, AI shortcut, or another source.
- `FormShell` accepts a static `cancelTo` page and cannot return to the previous origin or warn consistently about unsaved changes.
- Existing modal infrastructure is stronger than full-page task routing: `useDialogA11y` already supports Escape, focus trap, focus return, and inert background.

## Initial Hotspot Audit

| Surface | Current issue | Required direction |
| --- | --- | --- |
| Dashboard cards | Cards jump to detail pages by setting selected IDs and page names | Use record-aware routes and preserve Dashboard as origin when useful |
| Recipes list | Add Recipe opens `recipe-form` as a peer page | Route as `recipes/new` or modal/sheet with clear Back/Cancel to Recipes |
| Recipe detail | Scale/Edit/Create Order jump to peer pages | Add breadcrumb/back to Recipes; pass return context into scale/edit/order flows |
| Recipe form | Cancel and Save always go to Recipes | Edit should return to Recipe detail; Add should return to Recipes or the new detail after save |
| Recipe scaling | No explicit Back to recipe; Create Order exits into order form | Add route-aware Back; create order should preserve return path |
| Inventory list | Add Ingredient opens peer form | Route as `inventory/new`; preserve list filters where feasible |
| Ingredient detail | Edit goes to peer form; archive returns list | Add breadcrumb/back to Inventory; edit cancel/save returns detail |
| Ingredient form | Cancel and Save always go to Inventory | Add/Edit need different return targets and unsaved-change guard |
| Orders list | Add/Edit use `order-create`; detail uses selected ID state | Split new/edit/detail routes and preserve origin |
| Order form | Cancel and Save always go to Orders | Edit returns detail; creation from recipe/scaling returns source on cancel or new order detail on save |
| Order detail | Edit and delete have no parent breadcrumb/back | Add Back to Orders and record-aware URL |
| Production | Shortage actions send users to Shopping with no return path | Shopping should expose Back to Production or affected order/batch |
| Shopping | Operational purchases can be reached from Production/AI without return context | Route state should carry source context when opened as a task continuation |
| Costing | AI shortcut navigates to Costing without return | Preserve AI origin or avoid trapping users in a module switch |
| AI Assistant | Quick prompt buttons jump to Shopping/Costing/Conversions | Treat as navigation with return context where appropriate |
| Conversions | Inline edit/import modals are mostly appropriate | Audit buttons for focus return, Escape, and route escape consistency |
| Suppliers | Inline forms are better than full-page traps | Audit delete/edit/add flows for cancel, focus, and return behavior |
| Settings | More menu and settings subsections need clear location state | Preserve active subsection if route model supports it |
| Mobile nav | Bottom nav has six primary items | UIUX guidance expects at most five primary bottom nav items plus More |

## Decisions

- Decision: Treat Phase 005 as a navigation architecture change, not a cosmetic pass.
  Reason: The core problem is route hierarchy, back behavior, and workflow escape, not button styling.

- Decision: Keep the existing hash-router approach unless implementation discovers a compelling reason to add a router dependency.
  Reason: The app already has hash-based session restoration and Vercel/static compatibility; a typed in-app route parser can fix the issue with less blast radius.

- Decision: Record IDs belong in the route for durable views.
  Reason: Details, edit forms, scaling, and order flows need direct links, refresh safety, and browser Back support.

- Decision: Keep lightweight inline/modal interactions for quick secondary edits, but give durable workflows routes.
  Reason: Current modals are accessible and useful; the trap problem is mostly with large full-page task screens.

- Decision: Add explicit escape routes before broad visual redesign.
  Reason: Users need Back, Cancel, breadcrumbs, and return paths more urgently than a new visual system.

## Risks

- Risk: Reworking routing inside the large `src/App.tsx` file can become broad.
  Mitigation: Start with typed route helpers and migrate one workflow family at a time.

- Risk: Changing save/cancel destinations can surprise existing users.
  Mitigation: Use predictable hierarchy: new flows return to parent lists, edit flows return to the edited detail, cross-feature flows offer a visible return to source.

- Risk: Route params can point to missing or archived records.
  Mitigation: Add safe not-found/archived handling with clear Back to parent list.

- Risk: Browser Back can conflict with unsaved form changes.
  Mitigation: Add a single unsaved-change guard used by form Cancel, page navigation, and `beforeunload` where appropriate.
