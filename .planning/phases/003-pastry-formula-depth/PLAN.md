# Plan

## Outcome

Pastry County Kitchen OS supports pastry-grade recipe formulas: egg scaling honors Settings, recipes can store structured process metadata, and recipe ingredient lines can preserve prep state/component/stage details without breaking existing recipes or the 96/100 production-readiness baseline.

## Scope

Included:

- Settings-aware egg/yolk/white scaling behavior.
- Additive data model for recipe formula metadata.
- Additive data model for recipe-item prep state.
- Recipe form/detail/scaling UI updates using progressive disclosure.
- Tests for scaling, persistence, and existing recipe compatibility.
- Planning and audit milestone updates for all latest Baking and Pastry Arts findings.

Excluded:

- Full costing overhaul for labor, packaging, oven/fuel overhead, failed-batch allowance, and actual yield variance.
- Full allergen/storage compliance model.
- Full production QC logging.
- Full state-scoped conversion-rule redesign.
- Cooklang import/export.
- Any external legal, food-safety, or labeling compliance claim.

## Steps

1. Step: Pin the P1 findings with tests and data-shape checks.
   - Add tests proving current egg scaling ignores `eggRoundingPreference`.
   - Add expected behavior tests for `nearest_whole_egg` and `allow_gram_conversion`.
   - Add save/load compatibility checks for recipes without formula metadata or prep-state fields.
   - Inspect duplicate/export paths so new formula fields are not silently dropped.

2. Step: Fix settings-aware egg scaling.
   - Thread `settings.eggRoundingPreference` into `scaleRecipe` and `roundScaledQuantity`.
   - Make `nearest_whole_egg` actually round to the nearest whole count where count display is required.
   - Make `allow_gram_conversion` allow egg/yolk/white scaling through gram weights using the verified egg conversion standards.
   - Keep existing non-egg count-unit rounding behavior stable.
   - Update UI labels/helper text so operators understand whether scaled eggs are count-based or gram-based.

3. Step: Add recipe formula metadata.
   - Add an additive recipe metadata field, preferably a structured JSON object, for product family, formula version, pan profile, pan count, fill guidance, oven temperature, bake/cook time range, mixing method, rest/chill/cool windows, target doneness, sensory checkpoints, storage/service notes, and test-bake status.
   - Update schema, snapshot loading, API save/update, seed compatibility, recipe duplication, and audit logging.
   - Keep metadata optional with safe defaults so existing recipes continue to load.

4. Step: Add recipe-item prep state.
   - Add additive recipe item metadata for component, stage, sequence, ingredient state, temperature state, divided use, preparation notes, and optional handling warnings.
   - Support examples from the audit: cold cubed butter, melted butter, sifted flour, packed/scooped flour, divided sugar, roasted nuts, and room-temperature eggs.
   - Preserve the existing ingredient/quantity/unit/waste path for fast entry.

5. Step: Update recipe UI without bloating the workflow.
   - Add a compact Formula Profile section to Recipe Form.
   - Add a compact Prep/Stage section per ingredient row, collapsed or grouped where possible.
   - Surface formula metadata on Recipe Detail and Scaled Recipe views.
   - Preserve mobile-safe layout, 44px actions, visible focus, and no horizontal overflow.

6. Step: Update exports, AI summaries, and operator-facing displays where needed.
   - Include key formula profile fields in recipe exports or clearly scope export expansion for the next phase.
   - Let AI/assistant responses mention relevant formula metadata when asked about production method, scaling risk, pan changes, or bake timing.
   - Keep ingredient-specific conversion behavior intact.

7. Step: Verify locally.
   - Run `npm.cmd test`.
   - Run `npm.cmd run build`.
   - Run focused browser checks for recipe form/detail/scaling at desktop and mobile widths if UI changes are included.
   - Run `git diff --check`.

8. Step: Verify production after implementation.
   - Commit and push each completed local change.
   - Wait for the live deployment to serve the updated bundle/API.
   - Use live credentials from ignored `.env.local`.
   - Smoke a temporary recipe with formula metadata and prep-state lines.
   - Confirm existing recipes still load, duplicate, scale, and cost.

9. Step: Prepare the P2 follow-up phase.
   - Convert remaining Baking and Pastry Arts findings into the roadmap:
     - state-scoped conversion rules
     - expanded costing
     - ingredient allergen/storage controls
     - production QC logging
   - Do not mix these into the P1 implementation unless a small schema hook is needed to avoid rework.

## Verification

- Check: `npm.cmd test`
  Expected: all tests pass, including new settings-aware egg scaling and recipe metadata compatibility tests.

- Check: `npm.cmd run build`
  Expected: TypeScript and Vite production build pass.

- Check: recipe save/load compatibility
  Expected: existing recipes with no metadata still load; new recipes can save formula profile and item prep state; duplication preserves the new fields.

- Check: scaling behavior
  Expected: `nearest_whole_egg` and `allow_gram_conversion` produce distinct, documented results for eggs/yolks/whites.

- Check: recipe form mobile smoke
  Expected: Formula Profile and Prep/Stage controls fit at 320/360/390/414/430px with no horizontal overflow and reachable actions.

- Check: live temporary recipe smoke
  Expected: a temporary recipe with pan/time/temperature/checkpoint metadata and prep-state ingredient rows saves, reloads, scales, duplicates, and can be archived.

## Rollback

Because the data changes should be additive, rollback should only require hiding or ignoring formula/prep metadata in UI and API mapping. Avoid destructive migrations. If a live migration creates new columns or JSON fields, keep them nullable/defaulted so older bundles can continue reading existing data.
