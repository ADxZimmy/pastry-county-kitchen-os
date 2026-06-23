# Context

## Goal

Make onboarding dramatically easier by letting bakery teams import existing recipes, costing sheets, ingredient masters, supplier lists, and conversion/cost references from text, spreadsheets, PDFs, Word documents, and images.

## Relevant Files

- Path: `src/App.tsx`
  Why it matters: Hosts the current Recipes, Inventory, Costing, Conversions, and navigation flows that need import entry points and review screens.

- Path: `src/lib/kitchen.ts`
  Why it matters: Contains `parseRecipeText`, unit conversion, ingredient matching by existing data, recipe scaling, and costing behavior that import normalization should reuse.

- Path: `src/types.ts`
  Why it matters: Defines the current domain contracts for recipes, recipe items, formula metadata, cost profile, ingredient prep state, suppliers, and conversion rules.

- Path: `api/_actions.js`
  Why it matters: Owns role checks, normalization, audit logs, and `recipe.save`/`ingredient.save`/`conversion.save`; import commit should reuse the same validation semantics.

- Path: `scripts/import-approved-dish-costing-recipes.mjs`
  Why it matters: Existing one-off importer already proves source-cost preservation, canonical ingredient matching, and import audit metadata patterns.

- Path: `src/App.test.ts`
  Why it matters: Existing tests cover recipe parsing, costing, source line amounts, and route behavior; import fixtures should extend this coverage.

## Current Import Baseline

- The app can parse simple pasted recipe lines through `parseRecipeText`.
- Recipe items can preserve source costing fields in `prepState`, including source workbook/sheet/revision/package/needed quantity/line amount.
- Recipe costing already honors approved `sourceLineAmount` values when present.
- Backend normalization already protects formula metadata, item prep state, cost profile, ingredient allergen/storage profile, conversion scopes, and audit logs.
- There is no reusable user-facing import pipeline yet; the current import script is admin/operator-only and tailored to one source document.

## External Parser Research

- OpenAI file inputs can process PDF files, rich documents such as `.docx`, spreadsheets such as `.xlsx`/`.csv`, and text/code files; PDF handling can include extracted text plus page images on vision-capable models, while spreadsheets get a spreadsheet-specific augmentation flow. Source: https://developers.openai.com/api/docs/guides/file-inputs
- OpenAI structured outputs can force model output to follow a supplied JSON Schema, which fits the import-preview contract. Source: https://developers.openai.com/api/docs/guides/structured-outputs
- OpenAI vision-capable models can analyze image inputs, including text in images, from URLs or base64-encoded image data. Source: https://developers.openai.com/api/docs/guides/images-vision
- Azure Document Intelligence layout model extracts text, tables, selection marks, and document structure from PDF, images, and Office files; it is a strong fallback candidate for scanned/table-heavy inputs. Source: https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/prebuilt/layout
- Google Document AI supports OCR, layout parsing, form parsing, custom extraction, classification, and validation/correction workflows. Source: https://cloud.google.com/document-ai/docs/overview
- Amazon Textract detects typed/handwritten text and can extract forms/tables from image and PDF documents. Source: https://docs.aws.amazon.com/textract/latest/dg/what-is.html

## Decisions

- Decision: Build an import-review pipeline, not a direct parse-and-save shortcut.
  Reason: Recipe and costing mistakes affect stock, margins, shopping, and production; uncertain extraction must be visible before data is committed.

- Decision: Use deterministic parsers first and OCR/vision adapters second.
  Reason: Excel/CSV/text/Word/PDF text should be cheaper and more predictable; images and scanned PDFs need OCR/vision support.

- Decision: Keep the AI/OCR layer provider-adapter based.
  Reason: Accuracy, privacy, cost, and regional availability can change; the app should not hard-code one parsing vendor into domain logic.

- Decision: Commit imported data only through normal backend validation and audit paths.
  Reason: Imported records need the same permission checks, normalization, duplicate guards, and audit trail as hand-entered records.

- Decision: Preserve source evidence for every imported line.
  Reason: Businesses will need to trace a recipe line back to the workbook, sheet, page, image, or text line that produced it.

## Risks

- Risk: OCR/LLM extraction can misread quantities, units, ingredient names, and costs.
  Mitigation: Confidence scoring, side-by-side source preview, unresolved-field blocking, and explicit user confirmation.

- Risk: Duplicate ingredients or recipes can pollute onboarding data.
  Mitigation: Exact/fuzzy matching, duplicate review, "use existing/create new/skip" decisions, and commit-time duplicate checks.

- Risk: Untrusted files can carry malware-like payloads, prompt injection, private customer data, or huge resource usage.
  Mitigation: File size/type allowlist, no secret persistence, server-side sanitization, parser timeouts, provider data handling review, and no execution of embedded content.

- Risk: Vendor-based OCR/vision can increase cost and latency.
  Mitigation: Deterministic parsing first, async import jobs for large files, file/page limits, retry controls, and clear progress/status UI.

