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

## Non-Functional

- Requirement: Pastry-depth changes must preserve the 96/100 release-gate baseline.
  Acceptance: existing live-audit smoke checks still pass after formula-depth implementation, and existing recipes continue to load, scale, cost, duplicate, and archive.

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
  Status: Decide during Phase 1 auth design.

- Question: Is the live database schema still carrying an older integer column/type despite repo schema using numeric purchase prices?
  Status: Verify with a safe schema introspection or migration check before coding the decimal-cost fix.

- Question: Should large add/edit flows stay as full-page routes, modal sheets, or a hybrid by workflow?
  Status: Phase 005 defaults to durable routes for recipe, ingredient, and order forms, while keeping quick secondary edits in accessible modals.
