# UAT

## Scenario 1: Ingredient Allergen And Storage Profile

Create or edit an ingredient with contains allergens, may-contain allergens, dietary flags, cross-contact risk, storage location/temperature, humidity sensitivity, odor sensitivity, opened shelf life, and handling notes.

Expected: The ingredient detail page and inventory export show the profile after reload.

## Scenario 2: State-Scoped Conversion

Create a generic flour `cup -> g` rule and a scoped `sifted` flour `cup -> g` rule. Save a recipe item marked as sifted flour and scale/cost it.

Expected: The sifted rule is used for that recipe item; legacy recipes without state still use the generic rule.

## Scenario 3: Expanded Costing

Set a recipe cost profile with labor, packaging, utilities/overhead, failure allowance, and yield-loss allowance.

Expected: Recipe detail and Costing show ingredient subtotal separately from non-ingredient costs and calculate cost per effective saleable unit.

## Scenario 4: Production QC Completion

Start an order, open production completion, enter actual yield, room temp, batter/dough temp, oven temp, bake time, sensory notes, and next adjustment, then complete production.

Expected: Inventory is deducted once, the order is produced, and the QC log is visible after reload.

## Scenario 5: Mobile Production

Open Production at 320px and complete the QC modal flow.

Expected: No horizontal overflow, fields are reachable, actions remain 44px+, and the modal closes/returns focus correctly.
