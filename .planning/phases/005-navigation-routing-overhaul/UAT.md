# UAT

## Scenario 1: Recipes Hierarchy

Start on Recipes, open a recipe, edit it, cancel, edit again, save, then use browser Back.

Expected: Cancel and Save return to the same recipe detail. Browser Back moves through meaningful steps instead of landing on stale or unrelated pages. A visible Back/Breadcrumb can return to Recipes.

## Scenario 2: Add Recipe Recovery

Start on Recipes, open Add Recipe, enter data, then choose Back/Cancel.

Expected: The user sees an unsaved-change guard before losing typed data. Confirming returns to Recipes. Declining keeps the form intact.

## Scenario 3: Recipe Scaling To Order

Start on a recipe detail, open Scale Recipe, change the target yield, then create an order from the scaled recipe. Cancel the order.

Expected: Scaling has a visible Back to the recipe. The order form knows it came from scaling, and Cancel returns to scaling or the recipe context rather than dumping the user into Orders.

## Scenario 4: Inventory Detail And Edit

Start on Inventory, open an ingredient, edit it, cancel, then edit again and save.

Expected: Cancel and Save both return to the ingredient detail. The detail page has a visible Back to Inventory. Browser refresh on the detail URL keeps the same ingredient selected.

## Scenario 5: Orders Detail And Edit

Start on Orders, open an order, edit it, cancel, then edit again and save.

Expected: Cancel and Save return to order detail. Delete/archive returns to Orders. Browser Back never shows a detail page for the wrong order.

## Scenario 6: Production Shortage To Shopping

Start on Production and trigger a shortage path that opens Shopping.

Expected: Shopping shows a clear return action to Production or the affected order/batch. Completing or abandoning the purchase path does not trap the user.

## Scenario 7: AI Shortcut Navigation

Start on AI Assistant and use shortcuts for Shopping, Costing, and Conversions.

Expected: Each shortcut either keeps the user in AI with an inline result or navigates with a clear way back to AI. Browser Back returns to AI.

## Scenario 8: Mobile Bottom Navigation

Open the app at 320, 360, 390, 414, and 430px widths. Use every bottom nav item and the More menu.

Expected: No more than five primary bottom nav items are visible. More exposes secondary modules. Active state is correct, touch targets are usable, and no horizontal overflow appears.

## Scenario 9: Direct Links And Refresh

Open direct hashes for a recipe detail, recipe edit, ingredient detail, ingredient edit, order detail, and order edit. Refresh each page.

Expected: Valid records load correctly. Invalid or archived records show a safe message and a parent-list escape. Signed-out users are routed to Login without leaking private content.

## Scenario 10: Keyboard And Assistive Navigation

Use Tab, Enter, Space, Escape, browser Back, and form Cancel/Save across list/detail/form/modal flows.

Expected: Focus order is predictable, route changes place focus on the new page heading or first meaningful control, Escape still works for modals, and Back/Cancel controls are announced clearly.
