# Navigation Inventory

Date: 2026-06-23
Source command: `rg -n "setPage\(" src/App.tsx`

This inventory records the Phase 005 navigation surfaces after the route migration. Local pagination state in `PaginatedTable` also uses a `setPage` variable, but it is not app navigation and is excluded from the route audit.

## Top-Level Navigation

| Surface | Source area | Route target | Notes |
| --- | --- | --- | --- |
| Welcome Get Started | `Welcome` | `#dashboard` | Auth/welcome compatibility route. |
| Welcome Login | `Welcome` | `#login` | Auth route. |
| Login success | `Login` | `#dashboard` | Writes session route and token before bootstrap. |
| Desktop sidebar | `desktopNav` in `App` | top-level module routes | Active state uses route family, so detail/edit children keep parent module selected. |
| Mobile bottom nav | `bottomNav` in `App` | `dashboard`, `inventory`, `orders`, `production`, `settings`/More | Reduced to five primary items. Shopping and secondary modules live under More. |
| More grid | `SettingsPage` | secondary module routes | Gives mobile access to Recipes, Shopping, Costing, AI, Conversions, Suppliers, Settings. |

## Dashboard

| Surface | Source area | Route target | Back/return behavior |
| --- | --- | --- | --- |
| View Plan | `Dashboard` Today's Production | `#production` | Top-level module. |
| Notification open: ingredient | `Dashboard.openNotification` | `#inventory/<ingredientId>` | Parent route is Inventory. |
| Notification open: order | `Dashboard.openNotification` | `#orders/<orderId>` | Parent route is Orders. |
| Overdue/carryover order row | `Dashboard` | `#orders/<orderId>` | Parent route is Orders. |
| Low-stock row | `Dashboard` | `#inventory/<ingredientId>` | Parent route is Inventory. |

## Inventory

| Surface | Source area | Route target | Back/return behavior |
| --- | --- | --- | --- |
| Add Ingredient | `Inventory` toolbar | `#inventory/new` | Cancel returns Inventory; save returns saved ingredient detail. |
| Ingredient row/card | `Inventory` table/card | `#inventory/<ingredientId>` | Breadcrumb/back returns Inventory. |
| Edit Ingredient | `IngredientDetail` | `#inventory/<ingredientId>/edit` | Cancel/save return ingredient detail. |
| Archive Ingredient | `IngredientDetail` confirm | `#inventory` | Destructive modal retained; route returns list after archive. |
| Add Stock / Adjust Stock / View Usage | `IngredientDetail` | modal/local state | Existing accessible modal pattern retained. |

## Recipes

| Surface | Source area | Route target | Back/return behavior |
| --- | --- | --- | --- |
| Add Recipe | `Recipes` toolbar | `#recipes/new` | Cancel returns Recipes; save returns saved recipe detail. |
| Recipe card | `Recipes` list | `#recipes/<recipeId>` | Breadcrumb/back returns Recipes. |
| Scale Recipe from card/detail | `Recipes`, `RecipeDetail` | `#recipes/<recipeId>/scale` | Back returns recipe detail. |
| Edit Recipe | `RecipeDetail` | `#recipes/<recipeId>/edit` | Cancel/save return recipe detail. |
| Create Order from Recipe | `RecipeDetail` | `#orders/new?returnTo=recipes/<recipeId>` | Seeds order draft and cancel can return to recipe detail. |
| Duplicate Recipe | `RecipeDetail` | `#recipes/<newRecipeId>` | Save result opens duplicated recipe detail when API returns id. |
| Archive Recipe | `RecipeDetail` confirm | `#recipes` | Destructive modal retained; route returns list after archive. |
| Create Order from Scaling | `RecipeScaling` | `#orders/new?returnTo=recipes/<recipeId>/scale` | Cancel returns to scaling source; save opens order detail. |

## Orders And Production

| Surface | Source area | Route target | Back/return behavior |
| --- | --- | --- | --- |
| Add Order | `Orders` toolbar | `#orders/new` | Cancel returns Orders; save returns order detail. |
| Order card | `Orders` list | `#orders/<orderId>` | Breadcrumb/back returns Orders. |
| Edit Order | `OrderDetail` | `#orders/<orderId>/edit` | Cancel/save return order detail. |
| Delete Order | `OrderDetail` confirm | `#orders` | Destructive modal retained; route returns list after archive/delete. |
| Production order card | `Production` | `#orders/<orderId>?returnTo=production/<orderId>` | Back returns Production context. |
| Production shortage: batch | `Production` grouped batches | `#shopping?returnTo=production` | Visible Open Shopping List action plus disabled unsafe production actions. |
| Production shortage: order | `Production` order cards | `#shopping?returnTo=production/<orderId>` | Visible Open Shopping List action and Shopping return card. |
| Review Batch / Scaled Recipe / QC | `Production` | modal/local state | Existing accessible modal pattern retained. |

## Secondary Modules

| Surface | Source area | Route target | Back/return behavior |
| --- | --- | --- | --- |
| Shopping return card | `ShoppingList` | stored `returnTo` route | Visible Back action when launched from Production or AI. |
| AI shopping shortcut | `AiAssistant` | `#shopping?returnTo=ai` | Shopping shows return card. |
| AI costing shortcut | `AiAssistant` | `#costing?returnTo=ai` | Route carries return context for future Costing wayfinding. |
| AI conversion library | `AiAssistant` | `#conversions` | Top-level secondary route. |
| Conversion edit/import | `ConversionLibrary` | modal/local state | Existing modal pattern retained. |
| Supplier add/edit | `Suppliers` | inline/local state | Existing inline form pattern retained. |
| Staff, archive, audit, settings forms | `SettingsPage` | inline/local state | More page remains the top-level location. |

## Recovery And Guardrails

| Surface | Implementation | Behavior |
| --- | --- | --- |
| Unknown hash | `resolveSessionRoute` | Falls back to Dashboard for signed-in users or Login/Welcome for signed-out users. |
| Legacy hash | `parseAppRoute` + selected IDs | `#recipe-detail`, `#recipe-form`, `#ingredient-detail`, `#ingredient-form`, `#order-create`, and `#order-detail` remain compatible. |
| Missing record ID | Detail/form components | Shows not-found EmptyState with parent-list action instead of stale content or accidental create form. |
| Dirty forms | `FormShell` + `navigate` guard | Cancel, top nav, bottom nav, browser Back, and tab close protect unsaved changes. |
| Breadcrumb/back | `RouteWayfinding` | Child routes expose parent breadcrumbs and explicit Back actions. |
