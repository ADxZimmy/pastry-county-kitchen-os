# Requirements

## Functional

- Requirement: Honor pastry-aware egg scaling preferences.
  Acceptance: `nearest_whole_egg` and `allow_gram_conversion` produce distinct, tested scaling behavior for eggs, yolks, and whites; UI copy explains which mode is being used.

- Requirement: Store production-grade recipe formula metadata.
  Acceptance: recipes can save and reload structured oven temperature, bake/cook time range, pan profile, mixing method, rest/chill/cool windows, target doneness, sensory checkpoints, and storage/service notes without breaking existing recipes.

- Requirement: Preserve pastry-specific ingredient prep state.
  Acceptance: recipe item lines can capture state/stage details such as cold cubed butter, melted butter, sifted flour, packed/scooped flour, divided sugar, roasted nuts, and room-temperature eggs; detail and scaling views surface the state clearly.

- Requirement: Prepare a follow-up path for pastry production depth.
  Acceptance: state-scoped conversions, non-ingredient costing, allergen/storage controls, and production QC logs are sequenced into the roadmap with acceptance criteria before implementation.

- Requirement: Protect private app bootstrap data.
  Acceptance: unauthenticated `GET /api/bootstrap` returns 401 and no suppliers, staff, orders, movements, batches, audit logs, conversion rules, or settings; authenticated Owner/Admin still loads the app; lower roles receive only permitted data if role filtering is introduced.

- Requirement: Support decimal purchase costs end to end.
  Acceptance: shopping purchases with unit costs `0.5`, `0.64`, `2.75`, and whole-naira values succeed, update ingredient latest cost, create purchase logs, create inventory movements, create FEFO lots, and show friendly validation errors for invalid inputs.

- Requirement: Make AI and conversion outputs trustworthy for audit recipes.
  Acceptance: `4 cups flour = 480g`, `1 cup sugar = 200g`, `1 cup cocoa = 85g`, `4 eggs = 200g`, `3 yolks = 54g`, `2 whites = 60g`, and `1 cup coconut oil = 240ml`; duplicate active verified rules for the same ingredient/from/to combination are prevented or reconciled.

- Requirement: Fix mobile shopping accessibility.
  Acceptance: shopping selection controls meet 44px touch targets at 320/360/390/414/430 widths and hidden desktop/mobile duplicate controls are removed from the accessibility tree.

- Requirement: Make modals keyboard-safe.
  Acceptance: production review and scaled-recipe modals close on Escape, trap focus while open, return focus to the trigger on close, and keep background controls inert to keyboard and screen-reader users.

- Requirement: Make routes and dashboard time logic safe.
  Acceptance: unknown hashes route to dashboard or a not-found state without stale content; Today's Production filters by the current date and separates overdue/completed orders.

- Requirement: Improve audit-log operator search.
  Acceptance: searching an ingredient/customer/staff display name finds relevant audit rows, and exported/detail rows retain redacted before/after values.

- Requirement: Replace raw server errors with user-safe messages.
  Acceptance: SQL/internal errors are logged server-side but surfaced to users as clear operational messages with no raw database syntax.

- Requirement: Replace page-per-action dead ends with route-aware navigation.
  Acceptance: recipe, ingredient, and order lists, details, forms, scaling, and production/shopping handoffs have explicit parent routes, browser Back behavior, and visible Back/Breadcrumb controls.

- Requirement: Make durable record views deep-linkable.
  Acceptance: recipe, ingredient, and order detail/edit URLs include record IDs, survive refresh, show the intended record, and fall back safely when a record is missing or archived.

- Requirement: Preserve workflow origin across forms and cross-feature jumps.
  Acceptance: edit forms return to the edited detail record, new forms return to the parent list or new detail, and production/recipe/AI jumps to Shopping, Costing, Conversions, or Orders provide a clear way back.

- Requirement: Protect users from accidental form data loss.
  Acceptance: Add/Edit Recipe, Ingredient, and Order flows warn before leaving with unsaved changes via Cancel, Back, top/bottom navigation, browser Back, or tab close where feasible.

- Requirement: Fix mobile primary navigation structure.
  Acceptance: mobile bottom navigation has no more than five primary items, secondary modules live behind More, active state is reliable, and 320/360/390/414/430px viewports have usable touch targets and no horizontal overflow.

- Requirement: Import existing recipe and costing sources during onboarding.
  Acceptance: authenticated users can import pasted text, spreadsheets, PDFs, Word documents, and images into a reviewable draft; the system identifies recipes, ingredient lines, costing values, instructions, yields, formula metadata, and source evidence before any records are saved.

- Requirement: Import adjacent onboarding data when present.
  Acceptance: import drafts can classify and preview ingredient masters, supplier references, unit conversion rules, allergen/storage notes, product categories, and optional customer/order templates without forcing the user to commit all detected record types at once.

- Requirement: Prevent silent bad imports.
  Acceptance: low-confidence quantities, unknown ingredients, unknown units, duplicate recipe names, ambiguous costs, and unverified conversions are flagged for review; uncertain records cannot be committed until the user resolves or explicitly skips them.

- Requirement: Preserve import traceability.
  Acceptance: committed recipes and recipe items retain source filename/type plus sheet/page/row/line or OCR evidence where available; audit logs identify import-created or import-updated records.

- Requirement: Keep imported costing trustworthy.
  Acceptance: imported source line amounts continue to drive recipe costing where approved, while missing or suspect costs are marked incomplete instead of being silently estimated as authoritative.

## July 10 Expanded Audit Remediation

- Requirement: Show only truthful, attributable order history.
  Acceptance: every order event comes from persistent data for that order, includes a real timestamp and authenticated actor or explicit automated-job identity, and never displays static dates, statuses, or shortages. (PCO-001, RS-005)

- Requirement: Use server-canonical order pricing everywhere.
  Acceptance: sale quantity and unit price are distinct from production yield; line subtotal/discount and order delivery/tax/discount/payment totals are validated and calculated server-side; all margin, report, dashboard, and helper surfaces consume the persisted net total and show an explicit missing-price state for legacy orders. (PCO-002)

- Requirement: Keep helper and conversion claims honest.
  Acceptance: the deterministic feature is labelled Kitchen Helper; saving a conversion rule and changing a recipe are separate actions; recipe application requires a review of original/suggested/final values, provenance, authenticated approval, successful persistence, and reload confirmation. Model-backed branding is allowed only after Phase 014 evidence passes. (PCO-003)

- Requirement: Make production eligibility and completion safe.
  Acceptance: Africa/Lagos Today/Tomorrow/This Week boundaries and terminal-status exclusions are shared across all queues; invalid state transitions are rejected server-side; completion uses database locks, uniqueness-backed idempotency, QC confirmation, atomic FEFO/stock/event writes, and no duplicate deduction. (PCO-004, PCO-005)

- Requirement: Validate recipe and order quantities at every trust boundary.
  Acceptance: recipe base yield, recipe-item quantities, scaling target, order requested yield, sale quantity, prices, discounts, tax, and stock changes reject non-finite or invalid values on client and server; scaling never emits NaN, Infinity, zero, or negative requirements. (PCO-006)

- Requirement: Make settings real or remove them.
  Acceptance: one shared frontend/API policy contract governs rounding, deduction stage, negative-inventory behavior, tax, reservation, and unit increments; every retained setting has a save/reload behavior test; unsafe or obsolete toggles are removed or renamed rather than silently ignored. (PCO-007)

- Requirement: Distinguish divisible from indivisible inventory.
  Acceptance: ingredients carry `allowsDecimals` and `minimumIncrement`; pcs/pack/box/roll default to whole units; forms, API validation, scaling, and shopping enforce the same rule without rewriting historical records. (PCO-008)

- Requirement: Protect cancellation and correction workflows.
  Acceptance: cancellation requires reasoned confirmation and explains reservation/production/deduction consequences; pre-deduction cancellation releases reservations transactionally; post-deduction cancellation is blocked unless an explicit authorized correction/reversal workflow records balanced movements and events. (PCO-009)

- Requirement: Scale loading without weakening authorization.
  Acceptance: high-growth orders, audit, and movement data use paginated role-filtered endpoints; bootstrap shrinks measurably; route chunks and immutable hashed assets are verified in production; CI enforces test/build and performance budgets. (PCO-010, PCO-011, RS-007)

- Requirement: Harden sessions, recovery, and API privacy.
  Acceptance: no deployed mutator bypasses DB-backed role/session checks; production requires a dedicated session secret; sessions use opaque server-side records in HttpOnly Secure cookies with CSRF protection; authenticated responses are private/no-store; reset tokens are hashed, single-use, expiring, generically requested, rate-limited in a shared store, and revoke sessions after use. (PCO-012, PCO-015, RS-001..RS-004, RS-006)

- Requirement: Close the confirmed accessibility and presentation gaps.
  Acceptance: normal text contrast is at least 4.5:1, primary mobile labels are legible, record actions are semantic and keyboard-operable, and keyboard/screen-reader/mobile-keyboard UAT is recorded; dashboard guidance includes provenance or is removed; UTF-8 scans show no mojibake. (PCO-013, PCO-014, PCO-016)

- Requirement: Prove demo and release readiness with authenticated evidence.
  Acceptance: Phase 015-A passes before any unscripted demo, Phase 015-B passes after MVP hardening, temporary data is isolated and cleaned up, before/after persistence is captured, and a fresh external audit—not an internal score—is used for the release decision.

## Non-Functional

- Requirement: Audit remediation must recover from the active 54/100 Not Ready baseline without regressing earlier verified workflows.
  Acceptance: existing Phase 001-006 smoke checks remain green, each July 10 finding has evidence in `.planning/AUDIT-REMEDIATION.md`, the Demo Trust and MVP gates pass, and no launch score is claimed before a fresh independent audit.

- Requirement: Import processing must protect private business data.
  Acceptance: file uploads are authenticated, size/type-limited, not committed as raw secrets, and processed through a provider abstraction with documented data-retention/cost risks before any external OCR/vision service is enabled in production.

- Requirement: Production readiness must be proven by repeatable checks.
  Acceptance: unit/API tests, production build, authenticated live smoke, unauthenticated API security checks, mobile/a11y smoke, and cleanup checks pass before another external audit.

- Requirement: Navigation readiness must be proven by repeatable checks.
  Acceptance: route helper tests, workflow navigation tests, mobile navigation checks, and a production Playwright navigation smoke pass before Phase 005 is considered complete.

- Requirement: Live test data must be temporary and recoverable.
  Acceptance: smoke-created users and `AUDIT-*` records are archived or deleted, and cleanup checks report zero active temporary records unless a test intentionally preserves evidence.

## Out Of Scope

- A full multi-tenant permission redesign unless role-filtered bootstrap becomes necessary.
- Sending real low-stock emails during automated audit unless the recipient is a controlled test inbox.
- Large visual redesign outside the audit findings.
- Backend schema changes for the navigation overhaul unless implementation discovers a durable routing requirement that cannot be handled in the frontend.

## Open Questions

- Question: Should `/api/bootstrap` return role-filtered data for Viewer/Baker, or should all authenticated users receive the same snapshot while mutating APIs enforce role permissions?
  Status: Resolved in Phase 002: non-admin bootstrap snapshots filter sensitive staff/audit/private settings data. Route-scoped endpoints in Phase 012 must preserve or strengthen that rule.

- Question: Is the live database schema still carrying an older integer column/type despite repo schema using numeric purchase prices?
  Status: Resolved during Phase 001 decimal schema repair and live fractional-purchase verification.

- Question: Should large add/edit flows stay as full-page routes, modal sheets, or a hybrid by workflow?
  Status: Resolved in Phase 005: durable record/form routes with accessible modals for quick secondary work.

- Question: Which model provider, retention policy, and monthly budget should Phase 014 use?
  Status: Open decision before Phase 014 implementation; the remediation plan is provider-abstracted and does not assume a provider-specific skill or credential.
