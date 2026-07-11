# External Audit Handoff

Date: 2026-06-16
Last updated: 2026-07-11
Last verified: Phase 001-006 evidence on 2026-06-24; July 10 audit findings source-reconciled on 2026-07-11
Live URL: https://pastry-county-kitchen-os.vercel.app
Current audit-planning baseline: `123643b`
Latest checked deployment: Vercel success for `main`

## Current Status

> Supersession notice (2026-07-11): the July 10 expanded production audit scored `54/100` and marked the app **Not Ready**. It is the active release signal. The June 22 `96/100` result and Phase 001-006 smokes below remain historical regression evidence only. Current finding traceability, gates, and next actions live in `.planning/AUDIT-REMEDIATION.md`, `.planning/ROADMAP.md`, and `.planning/STATE.md`.

The revised sequence starts with Phase 006a Immediate Security Containment, then Phases 007-010 and an authenticated Demo Trust Gate, followed by Phases 011-014 and the final UAT/external audit rerun. No unscripted operator/investor demo or launch claim is approved from this historical handoff.

The June 22 external audit rerun 2 from session `019eeee0-894f-7880-b3fa-4a7c002de3ab` scored `96/100` at that earlier scope with zero findings, failing checks, advisory failures, request failures, or console warnings/errors.

After that release-gate pass, the Baking and Pastry Arts audit identified product-depth improvements for ingredient and recipe workflows. Those follow-up phases have now been implemented, pushed, deployed, and smoke-verified through Phase 006:

- Phase 003 Pastry Formula Depth: egg scaling preferences, recipe formula metadata, and recipe-item prep state.
- Phase 004 Pastry Costing, QC, and Compliance Depth: scoped conversions, expanded recipe costing, allergen/storage profiles, and production QC logging.
- Phase 005 Navigation and Routing Overhaul: durable hash routes, refresh-safe record links, route-aware Back/Cancel/Save behavior, five-item mobile nav, unsaved-change guards, and navigation smoke coverage.
- Phase 006 Recipe Import Onboarding: import entry points from operational pages, paste/file intake, CSV template, review-before-save flow, parser-backed text/CSV/TSV/XLSX/DOCX/text-PDF imports, provider-backed image/legacy file path, source-cost traceability, duplicate handling, role-checked commit, import batch audit logging, and plain-language import UI copy.

A fresh external audit has not yet been run after Phases 003-006. Treat the June 22 `96/100` as the previous release-gate baseline and this document as the handoff for the next audit pass.

## Historical Phase 001-006 Verification

Latest checked state:

- GitHub: local `main` is synced with `origin/main` at `3df5500`.
- Vercel: GitHub commit status for `3df5500` reports `success`.
- Live app: production bundle contains the latest import-page copy and no longer contains the rejected `Upload or snap`, `Extract Draft`, `photo reading`, or fallback-blame copy.
- `npm.cmd test`: 75/75 tests passed after the latest import-page copy polish.
- `npm.cmd run build`: production build passed after the latest import-page copy polish.
- `npm.cmd audit --audit-level=moderate`: passed during Phase 006 after replacing `exceljs` with `read-excel-file`.

Phase-specific production smokes already passed:

- `npm.cmd run smoke:phase3-pastry`: passed against production; created, reloaded, displayed, scaled, and archived a temporary formula-depth recipe.
- `npm.cmd run smoke:phase4-pastry-depth`: passed against production; created temporary ingredient/recipe/order data, verified allergen/storage/cost/scoped conversion/QC fields through API and UI, produced the order with QC, and archived temporary records.
- `npm.cmd run smoke:navigation-routing`: passed against production after Vercel deployed Phase 005.
- `npm.cmd run smoke:import-onboarding`: passed against production on Phase 006 deployment; imported a safe recipe/costing text sample, verified source-line amount/source-file metadata after reload, checked the mobile import page at 390px, and archived the temporary recipe.
- `npm.cmd run smoke:live-audit`: passed against production after Phase 006; umbrella coverage included Phase 2 rerun, Milestone 7, regression audit, Phase 3, Phase 4, navigation routing, and import onboarding.

Documentation-only commits or copy-only commits may create newer Vercel deployments than a phase implementation commit. Use GitHub/Vercel status as the source of truth for the current latest deployment, and use the phase verification files under `.planning/phases/*/VERIFICATION.md` for detailed command evidence.

## Historical Pre-July-10 Audit Focus

The checklist below documents earlier coverage. For the next audit, use the July 10 PCO-001..PCO-016 matrix and RS-001..RS-007 repo findings in `.planning/AUDIT-REMEDIATION.md` first, then retain these items as regression checks.

Ask the next external audit to retest the previous release-gate/security cases first:

- Revoked low-privilege tokens cannot call authenticated `/api/bootstrap`; the response is 401 and contains no kitchen snapshot.
- Viewer or other low-privilege bootstrap responses do not include admin-only staff/session/audit data.
- Fresh browser login from empty local storage reaches Dashboard and persists `pastry-county-session.user.token` before the first bootstrap read.
- AI chat conversion prompts with punctuation return verified rule quantities and never fall back to `1 g -> 1g`.
- Production has no horizontal overflow at 320x568.
- Mobile table cards use valid semantic list markup or valid ARIA ownership, and Production heading order is valid.

Also retest the former 72/100 June 22 live-audit cases:

- Unauthenticated `/api/bootstrap` returns 401 with no private data; authenticated signed users can load the app.
- Shopping purchases accept decimal unit costs such as `0.5`, `0.64`, `2.75`, and whole values without raw SQL errors.
- Conversion rules are unique and correct for flour, sugar, cocoa, egg, yolk, white, and coconut oil; natural AI prompts like `Convert 1 cup sugar to grams` parse correctly.
- Shopping controls meet 44px targets on 320-430px screens and expose only the active responsive representation.
- Review Batch, View Scaled Recipe, conversion, stock adjustment, and confirm dialogs close on Escape, trap focus, keep the background inert, and return focus to the trigger.
- Unknown hashes normalize safely to Dashboard, and Dashboard separates due-today work from overdue/carryover work.
- Audit Reports search/export by human-readable record display names while redacting passwords, tokens, sessions, hashes, secrets, and API keys.
- Repeated production deduction is idempotent for already-produced orders.
- Sub-naira unit costs display as decimals, for example `NGN0.50/g` and `NGN0.64/g`.
- Purchase Unit selector changes and persists for `pcs`, `ml`, `g`, and related units.
- Manual stock removals reject oversized removals and require destructive-action confirmation.
- FEFO lots decrement with manual removals and production deductions.
- Production shortage batches keep Start/Complete actions blocked.
- Recipe builder search/grouping and mobile modal behavior work at 360px-class widths.
- Shopping purchases validate positive quantity/cost and update inventory only after API success.
- Server-side roles reject unauthorized mutation actions.
- Staff disable/revoke-session behavior invalidates stale sessions.
- Audit exports redact passwords, tokens, sessions, hashes, and API keys.

Then audit the new work since the June 22 `96/100` baseline:

- Phase 003 formula depth:
  - Egg scaling preference changes visible behavior between whole-egg rounding and gram conversion.
  - Recipe formula metadata saves/loads and displays oven, bake time, pan, method, rest/chill/cool, doneness, and sensory checkpoints without mobile overflow.
  - Recipe ingredient prep state saves/loads and appears in recipe detail/scaling where useful.

- Phase 004 costing/QC/compliance depth:
  - Costing includes labor, packaging, overhead, utility, failure allowance, and yield loss fields.
  - Ingredient allergen/storage fields save/load and are visible in ingredient/recipe/production contexts where relevant.
  - Conversion rules can be scoped by ingredient state, temperature state, and formula context.
  - Production completion captures QC fields and remains idempotent/stock-safe.

- Phase 005 navigation:
  - Direct hashes for recipe, ingredient, and order detail/edit/scale routes load correctly after refresh.
  - Back/Breadcrumb/Cancel/Save behavior returns users to the right workflow context.
  - Unknown/missing records recover safely.
  - Unsaved form changes warn before navigation.
  - Mobile bottom nav exposes only five primary items and keeps secondary pages under More.

- Phase 006 import onboarding:
  - Import entry points exist from Recipes, Inventory, Costing, Conversions, desktop Import nav, and More/Onboarding.
  - Paste-text and file upload paths support the review-first flow.
  - CSV/TSV/XLSX/DOCX/text-PDF parsing preserves source evidence and costing lines where available.
  - Image/photo and legacy `.xls`/`.doc` files use the configured provider path; audit should verify actual provider behavior only if provider environment variables are configured.
  - Users can review, correct, skip, and save selected recipes, ingredients, suppliers, and conversions.
  - Duplicate recipes are blocked unless the user explicitly saves another copy.
  - Imported recipe items preserve source file/reference/cost fields after reload.
  - `import.extract` and `import.commit` enforce roles, validate unresolved lines, write import batch summaries, and audit the commit.
  - Customer/order rows are previewed only; they do not create active orders or mutate stock in this phase.
  - Import UI copy is operator-friendly: no `Upload or snap`, `Extract Draft`, `commit`, `OCR/vision provider`, or hidden-setting language.

## Known Remaining Actions

- Run a fresh external audit after the owner finishes the next requested feature batch.
- If the business wants to market photo/scanned import as production-ready, configure and audit the OCR/vision provider path, including quality, cost, and data-retention behavior.
- If the business wants direct customer/order import, scope a follow-up phase because Phase 006 currently previews customer/order rows but does not create active orders.
- Close the separate 100/100 certification evidence items: external SPF/DKIM/DMARC/DNS proof, controlled email delivery evidence, backup/restore or rollback drill, keyboard/screen-reader sign-off, monitoring/incident owner evidence, and manual operator sign-offs.
