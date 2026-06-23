# UAT

## Scenario 1: Paste A Recipe

User pastes a handwritten-style text recipe into Import, reviews parsed ingredients/instructions/yield, fixes one unknown unit, commits, and lands on the new recipe detail route.

## Result

Passed through automated parser coverage and production smoke. `npm.cmd run smoke:import-onboarding` imported a pasted recipe/costing sample, committed it, verified the recipe detail/source evidence after reload, checked the mobile import page at 390px, and archived the temporary recipe.

## Notes

Expected to be the first low-friction import path because it does not require external OCR.

## Scenario 2: Import A Costing Spreadsheet

User uploads an Excel/CSV costing sheet with recipe names, ingredient lines, package prices, needed quantities, and line amounts. The app detects recipes and source costs, matches known ingredients, asks for unresolved matches, commits, and recipe costing honors source line amounts.

## Result

Covered for CSV-style costing rows by automated parser tests and for source-cost preservation by production smoke. The live smoke verified `prepState.sourceLineAmount` and `prepState.sourceFile` after import/reload.

## Notes

This is the core public-onboarding business value.

## Scenario 3: Snap A Recipe Photo

User takes a phone photo of a recipe/costing page, the app extracts text/table structure, flags low-confidence quantities, user corrects them, commits, and the audit/source metadata identifies the image/page line that generated each recipe item.

## Result

Provider path implemented and deterministic OCR mock covered by automated tests. Live camera OCR quality is not claimed until `OPENAI_API_KEY`/provider configuration and cost/data-retention review are completed.

## Notes

Requires OCR/vision adapter and mobile camera/browser verification.
The implementation includes the provider path, but production provider configuration must be verified before claiming camera OCR readiness.

## Scenario 4: Import Mixed Onboarding Workbook

User uploads a workbook with Ingredients, Suppliers, Recipes, and Conversions sheets. The app classifies each sheet, previews counts by record type, lets the user import only Recipes and Ingredients first, and leaves Suppliers/Conversions as skipped or pending.

## Result

Covered for mixed CSV classification by automated parser tests, including recipes, ingredients, suppliers, conversions, customer templates, and order templates. XLSX/DOCX/text-PDF extraction paths are implemented through parser dependencies; direct live workbook-file smoke remains a useful follow-up demo check, but production import commit smoke has passed.

## Notes

This scenario should become the demo-ready onboarding story for businesses moving from spreadsheets.
