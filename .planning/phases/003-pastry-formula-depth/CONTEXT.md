# Context

## Goal

Use the Baking and Pastry Arts audit from Codex session `019eeee0-894f-7880-b3fa-4a7c002de3ab` to move ingredient and recipe workflows from operationally solid to pastry-formula grade.

## Source Inputs

- External rerun 2 result: `96/100 - ready for 95+ release gate`, with no Critical, High, or Medium findings reproduced.
- Latest session finding: Baking and Pastry Arts audit on June 23, 2026.
- Baking and Pastry Arts skill guidance:
  - Treat pastry as formula systems, not isolated recipes.
  - Prefer weights, baker's percentages, ingredient-specific conversions, pan-area math, temperatures, timing ranges, and sensory checkpoints.
  - Production planning needs batch math, equipment load, critical control points, QC logs, storage, transport, allergens, and labeling awareness.
- UI UX Pro Max guidance:
  - Keep operations interfaces data-dense but scannable.
  - Use progressive disclosure for complex recipe/ingredient metadata.
  - Preserve mobile readability, touch targets, focus states, and responsive constraints.

## Latest Findings

- P1: Recipe records are not production-grade formulas yet.
- P1: Recipe ingredients lose pastry-specific state.
- P1: Egg scaling setting is exposed but ignored.
- P2: Conversion rules are not state-scoped enough for pastry.
- P2: Costing is ingredient-only.
- P2: Ingredient master lacks structured allergen and storage controls.
- P2: Production completion lacks QC logging.

## Relevant Files

- Path: `db/schema.sql`
  Why it matters: source schema for recipes, recipe items, conversion rules, ingredients, settings, and production-adjacent data.

- Path: `api/_db.js`
  Why it matters: loads and normalizes kitchen snapshot data from Neon into app shapes.

- Path: `api/_actions.js`
  Why it matters: persists recipes, recipe items, settings, production completion, inventory movements, and audit logs.

- Path: `src/types.ts`
  Why it matters: defines the app data contracts for recipes, recipe items, conversion rules, ingredients, and settings.

- Path: `src/lib/kitchen.ts`
  Why it matters: owns scaling, costing, conversions, AI response logic, shopping math, and production helpers.

- Path: `src/App.tsx`
  Why it matters: contains the recipe form/detail/scaling UI, ingredient form, settings form, production views, and UAT surfaces.

- Path: `src/App.test.ts`
  Why it matters: current fast coverage for recipe scaling, costing, conversion parsing, stock availability, and formatter behavior.

- Path: `scripts/*smoke*.mjs`
  Why it matters: repeatable live and browser smoke checks can be extended after implementation.

## Decisions

- Decision: Treat the `96/100` rerun as the operational release gate pass.
  Reason: Rerun 2 found zero failing checks, advisory failures, findings, request failures, or console warnings/errors.

- Decision: Treat this phase as product-depth work, not an emergency production blocker.
  Reason: The latest Baking and Pastry Arts audit identifies missing professional formula controls rather than regressions against the 95+ gate.

- Decision: Start with the P1 findings.
  Reason: Egg scaling correctness, formula metadata, and recipe-item prep state directly affect recipe repeatability and later QC/costing features.

- Decision: Prefer additive schema/data-contract changes.
  Reason: Existing live recipes, seed data, tests, and production smoke flows must continue loading while formula metadata is introduced.

- Decision: Use progressive disclosure in UI.
  Reason: Formula depth should not make fast recipe entry feel heavy for simple bakery products.

## Risks

- Risk: Adding too many recipe fields at once makes the form slower and harder to use.
  Mitigation: Group fields into compact formula/prep sections and preserve simple defaults.

- Risk: Egg gram conversion can confuse count-unit users.
  Mitigation: Make the setting behavior explicit and prove both modes in tests and UI copy.

- Risk: New metadata may not be included in exports, duplication, or audit logs.
  Mitigation: Add tests for save/load/duplicate/export or explicitly scope export updates into a follow-up step.

- Risk: P2 compliance-style fields can sprawl.
  Mitigation: Keep Phase 003 focused on P1 core formula controls and sequence P2 items into the roadmap.
