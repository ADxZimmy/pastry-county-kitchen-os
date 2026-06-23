# Context

## Goal

Close the remaining Baking and Pastry Arts P2 blockers by making conversions prep-state aware, costing production-aware, ingredients allergen/storage aware, and production completion QC-logged.

## Relevant Files

- Path: `src/types.ts`
  Why it matters: Shared frontend data contracts for ingredient profiles, conversion scopes, recipe cost profiles, and production QC logs.

- Path: `db/schema.sql`
  Why it matters: Durable additive schema for live Neon data and local setup.

- Path: `api/_db.js`
  Why it matters: Snapshot loading and live schema drift repair.

- Path: `api/_actions.js`
  Why it matters: Ingredient save, recipe save, conversion save, and order production completion actions live here.

- Path: `src/lib/kitchen.ts`
  Why it matters: Conversion lookup, recipe costing, order costing, and production requirement calculations live here.

- Path: `src/App.tsx`
  Why it matters: Ingredient forms/details, recipe costing profile, conversion library, costing page, and production completion UI live here.

- Path: `scripts/phase3-pastry-smoke.mjs`
  Why it matters: Pattern for authenticated live smoke tests that create/archive temporary data.

## Decisions

- Decision: Use additive JSON profile fields for ingredient allergen/storage and recipe cost profiles.
  Reason: Keeps older live rows compatible while allowing structured controls without destructive migrations.

- Decision: Add optional scope columns to conversion rules instead of replacing the conversion model.
  Reason: Existing verified rules remain valid as generic fallbacks, while state-specific rules can override for sifted/packed/cold/melted contexts.

- Decision: Store production QC logs in a new table keyed to order and optional recipe/batch identifiers.
  Reason: QC is event history, not an order status field; actual yield, temperatures, sensory notes, and next adjustments need auditability.

- Decision: Capture allergen/storage awareness, not legal labeling certification.
  Reason: The Baking and Pastry Arts skill explicitly says to flag local rules without inventing legal compliance.

## Risks

- Risk: Production completion becomes slower if QC is too heavy.
  Mitigation: Use a compact modal with defaults and optional fields; keep stock deduction path intact.

- Risk: Scoped conversion matching could break generic rules.
  Mitigation: Prefer exact state/temperature/context matches, then fall back to generic active rules.

- Risk: Costing totals could surprise users who expect ingredient-only costs.
  Mitigation: Show ingredient subtotal and non-ingredient costs separately.

- Risk: Live schema drift may omit new fields during the first deploy.
  Mitigation: Add `alter table ... add column if not exists` and table creation to both snapshot load and action paths.
