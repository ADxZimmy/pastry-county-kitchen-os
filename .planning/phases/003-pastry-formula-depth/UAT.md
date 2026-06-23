# UAT

## Scenario 1: Egg Scaling Preference

User action and expected result:

An operator switches Settings between `Nearest whole egg` and `Allow gram conversion`, then scales a recipe containing eggs, yolks, or whites. The scaled output changes according to the selected preference and explains the unit choice clearly.

## Result

Not run.

## Notes

This scenario should be backed by unit tests and a browser smoke check after implementation.

## Scenario 2: Formula Profile

User action and expected result:

An operator creates or edits a recipe with oven temperature, bake time range, pan profile, mixing method, rest/chill/cool windows, target doneness, and sensory checkpoints. The recipe saves, reloads, duplicates, exports or displays predictably, and remains usable on mobile.

## Result

Not run.

## Notes

Existing recipes with no profile metadata must still display cleanly.

## Scenario 3: Ingredient Prep State

User action and expected result:

An operator adds recipe ingredient lines that distinguish prep state and stage, such as cold cubed butter, melted butter, sifted flour, divided sugar, roasted nuts, and room-temperature eggs. The details remain visible in recipe detail and scaling views.

## Result

Not run.

## Notes

Fast entry should remain possible when no prep state is needed.

## Scenario 4: Existing Recipe Compatibility

User action and expected result:

An operator opens, scales, duplicates, costs, and archives an existing recipe created before Phase 003. The recipe works without missing-field errors or visual clutter.

## Result

Not run.

## Notes

This should be included in the live temporary recipe smoke.
