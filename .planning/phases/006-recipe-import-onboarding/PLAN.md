# Plan

## Outcome

Users can import existing bakery operating data from text, spreadsheets, PDFs, Word documents, and images into a reviewable draft, fix uncertain matches, then commit approved recipes and costing data safely into Kitchen OS.

## Scope

Included:

- Import entry points from Recipes, Inventory, Costing, Conversions, and More/Onboarding.
- Supported input families: pasted text, `.csv`, `.tsv`, `.xls`, `.xlsx`, `.doc`, `.docx`, `.pdf`, `.txt`, `.md`, and common camera/image formats such as `.jpg`, `.jpeg`, `.png`, `.webp`, and `.heic` when supported by the selected parser.
- Imported data classes: recipes, recipe ingredient lines, recipe instructions, formula metadata, source costing lines, non-ingredient cost profile fields, ingredient master data, supplier references, unit conversion rules, allergen/storage notes, products/categories, and optional customer/order templates if detected.
- A parser result contract with source evidence, confidence, warnings, unresolved fields, duplicate candidates, and normalized domain drafts.
- Human review before commit, including ingredient matching, unit/cost correction, duplicate handling, and selective import.
- Backend commit through existing role checks, validation, audit logging, and recipe/ingredient/conversion save semantics.
- Fixture-based verification for text, spreadsheet, Word/PDF text, scanned/image OCR, duplicate handling, and source-cost preservation.

Excluded:

- Silent auto-import of uncertain OCR/LLM results.
- Direct inventory stock mutation from imported costing sheets unless a future stock-opening-balance flow explicitly supports it.
- Full migration connectors for every legacy POS/accounting/recipe system.
- Custom-trained OCR/extractor models in the first pass.
- Long-term raw document retention beyond temporary processing and optional user-approved source evidence.

## Product UX Shape

1. Entry: "Import" action in Recipes plus a broader Onboarding/More entry for bulk setup.
2. Intake: Drag/drop, file picker, camera capture on mobile, and paste-text mode.
3. Classify: Show what the app detected: recipes, costing, ingredients, suppliers, conversions, or mixed workbook.
4. Review: Side-by-side source preview and normalized draft cards/tables.
5. Resolve: Flag missing ingredients, unknown units, ambiguous costs, duplicate recipes, and low-confidence OCR lines.
6. Commit: User selects records to import and confirms; app saves only approved rows.
7. Result: Summary with created/updated/skipped records, warnings, audit links, and next actions such as "open recipe", "finish missing costs", or "verify conversions".

## Import Architecture

1. `import.extract`: authenticated API endpoint receives file/text metadata, validates type/size, and returns an extraction job/result.
2. Source extractors:
   - Text/Markdown: deterministic line/block parser.
   - CSV/TSV/XLS/XLSX: workbook parser that preserves sheet names, headers, merged-cell context when available, formulas-as-values, and row coordinates.
   - DOC/DOCX: document text/table parser.
   - PDF text: text/table extraction first.
   - Scanned PDF/Image: OCR/vision adapter, selected behind a provider interface.
3. `import.classify`: detects document shape: recipe card, costing sheet, ingredient master, supplier list, conversion table, order/customer template, or mixed workbook.
4. `import.normalize`: maps raw extraction to a stable `ImportDraft` JSON schema using existing units, ingredient aliases, conversion rules, categories, cost profile fields, and formula metadata.
5. `import.review`: frontend stores the draft locally/session-side, renders source evidence, and lets users correct mappings before saving.
6. `import.commit`: authenticated backend action commits selected drafts through existing normalization/audit logic and records an import batch summary.

## Data Contract

- `ImportBatch`: id, source filename/type, parser version, actor, createdAt, status, counts, warnings.
- `ImportSourceSpan`: page/sheet/row/column/line/bounding box/text snippet for traceability.
- `ImportDraftRecipe`: name, category, base yield, yield unit, instructions, formula metadata, cost profile, line items, confidence, warnings.
- `ImportDraftIngredient`: name, category, base unit, purchase unit, latest unit cost, supplier, reorder level, allergen/storage notes, confidence, duplicate candidates.
- `ImportDraftRecipeItem`: ingredient decision, quantity, unit, waste, notes, prep state, source package quantity/price, source needed quantity, source line amount, confidence.
- `ImportDraftConversionRule`: ingredient, from unit, to unit, factor, source, confidence, verified flag defaulting to false unless user confirms.
- `ImportCommitResult`: created, updated, skipped, blocked, warnings, audit log ids, and direct route targets.

## Steps

1. Define import contracts and fixtures.
   - Add TypeScript/domain types for import drafts.
   - Add fixture files or fixture text for recipe card, costing sheet, ingredient master, supplier list, conversion table, and scanned/OCR-like recipe text.
   - Add acceptance tests for normalization independent of provider calls.

2. Build deterministic parsing foundation.
   - Extend `parseRecipeText` or create `src/lib/imports.ts` for source-aware recipe/costing normalization.
   - Implement CSV/TSV support first because it is easiest to verify and gives users a template path.
   - Add spreadsheet parser support after package security review.
   - Preserve source workbook/sheet/row metadata in recipe item `prepState`.

3. Add backend import actions.
   - Add `import.extract`/`import.commit` actions with permissions for Owner/Admin and Baker where appropriate; ingredient/supplier commits require Owner/Admin or Inventory Manager.
   - Reuse `normalizeRecipeFormulaMetadata`, `normalizeRecipeItemPrepState`, `normalizeRecipeCostProfile`, ingredient normalization, conversion normalization, and audit helpers.
   - Add duplicate detection before commit and friendly blocking messages.

4. Add OCR/vision adapter.
   - Define an interface with provider, file type, extracted text/tables, confidence, source spans, token/page/cost metadata, and warnings.
   - Start with one production provider behind env vars; keep Azure/Google/AWS/OpenAI as documented adapter candidates.
   - Add a local deterministic/mock adapter for tests so CI never depends on external OCR calls.

5. Build the import review UI.
   - Add route-aware import screens using Phase 005 navigation patterns.
   - Use an operations-dashboard style: compact progress, clear record counts, confidence badges, editable tables, and no decorative onboarding fluff.
   - Mobile flow must support camera capture, large touch targets, and recoverable correction steps.
   - Provide "download CSV template" and "paste recipe text" fallbacks.

6. Commit and audit.
   - Save recipes, ingredients, conversions, and suppliers in an import transaction where possible.
   - Store import batch metadata in audit logs or a lightweight `import_batches` table if useful for traceability.
   - Ensure every imported recipe line has source evidence in notes or `prepState`.

7. Verify and harden.
   - Unit/API tests for all parser contracts and commit paths.
   - Playwright smoke for import text/CSV/template and review/commit/cancel flows.
   - Manual live smoke using non-secret sample files and cleanup.
   - Update `.planning`, user docs, and smoke scripts.

## Verification

- Check: `npm.cmd test`
  Expected: Unit/API tests pass, including parser fixtures, duplicate blocking, source-cost preservation, and role checks.

- Check: `npm.cmd run build`
  Expected: TypeScript/Vite build succeeds.

- Check: targeted import smoke script
  Expected: Authenticated test user imports a sample recipe/costing CSV or pasted text, resolves one ingredient, commits, sees the recipe detail route, and cleanup archives temporary records.

- Check: mobile browser smoke at 320/360/390/414/430 widths
  Expected: Import wizard has no horizontal overflow, camera/file controls are reachable, and review tables/cards remain usable.

- Check: live deployment smoke using ignored `.env.local` credentials
  Expected: Production can parse and commit safe sample files without leaking secrets or leaving test data active after cleanup.

## Rollback

- If import commit causes bad data, imported records must be identifiable by import batch/audit metadata and archived through existing archive actions.
- If OCR/vision provider behavior is unstable, disable the provider env flag and keep text/CSV/manual import available.
- If a new parser dependency is risky, revert that dependency and keep the import contract/tests in place for another provider.

