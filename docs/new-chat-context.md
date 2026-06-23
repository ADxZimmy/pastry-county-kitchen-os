# Pastry County Kitchen OS - New Chat Context

Last updated: 2026-06-23
Repo: `C:\Users\PC\Documents\Nitech\Personal\Pastry County Kitchen OS`
Live app: `https://pastry-county-kitchen-os.vercel.app`
Current local branch at time of this map: `main`
Current local commit: run `git rev-parse --short HEAD`; Phase 006 implementation/deployment commit was `a862c50`.

Use this file when starting a fresh chat context. It maps what the app is, where the important code lives, what has already been verified, and which docs are authoritative when older planning notes disagree.

## Read First

Start with these files in this order:

1. `AGENTS.md` for repository operating rules.
2. `docs/new-chat-context.md` for this whole-codebase map.
3. `.planning/STATE.md` for the latest work status.
4. `docs/audit-handoff.md` for the latest external-audit handoff.
5. `.planning/phases/006-recipe-import-onboarding/VERIFICATION.md` for the completed import/onboarding verification.
6. `.planning/phases/006-recipe-import-onboarding/PLAN.md` for the import/onboarding requirements.
7. `.planning/phases/005-navigation-routing-overhaul/VERIFICATION.md` for the completed navigation/routing verification.
8. `.planning/phases/004-pastry-costing-qc-compliance/VERIFICATION.md` for the latest completed Phase 004 verification.
9. `docs/certification/README.md` for the separate 100/100 certification evidence track.

Important repository rule: after any local code or documentation change in this repo, commit and push before ending the turn unless the user explicitly says not to. Deployment-triggering commits should use the repo owner identity:

`ADxZimmy <84815694+ADxZimmy@users.noreply.github.com>`

Never commit secrets. Live test credentials are in ignored `.env.local` as `LIVE_TEST_EMAIL` and `LIVE_TEST_PASSWORD`.

## Current State

Pastry County Kitchen OS is a mobile-first bakery operations dashboard for inventory, recipes, production, shopping, costing, orders, staff, audit logs, and ingredient conversion workflows. It is backed by Neon Postgres and deployed on Vercel.

The strongest current audit signal is the June 22 external audit rerun 2: `96/100`, zero findings, zero failing checks, zero advisory failures, zero request failures, and zero console warnings/errors. That cleared the 95+ release gate after Phase 002.

After that, product-depth work continued:

- Phase 003 Pastry Formula Depth was implemented, pushed, deployed, and production-smoke verified.
- Phase 004 Pastry Costing, QC, and Compliance Depth was implemented, pushed, deployed, and production-smoke verified.
- The umbrella `npm run smoke:live-audit` now runs Phase 002, Milestone 7, regression audit, Phase 003, Phase 004, navigation-routing, and import-onboarding smoke coverage, and it passed against production after Phase 006.
- Phase 005 Navigation And Routing Overhaul was implemented, pushed, deployed, and production-smoke verified. The former page-per-action risk is now corrected with route-aware hierarchy, direct record links, Back/Breadcrumb controls, contextual form exits, mobile nav cleanup, unsaved-change guards, and navigation smoke coverage.
- Phase 006 Recipe Import Onboarding was implemented, pushed, deployed, and production-smoke verified on commit `a862c50`. It adds a review-first import pipeline for pasted text, CSV/TSV, XLSX, DOCX, text PDFs, and provider-backed image/scanned/legacy files, with support for recipes, costing rows, ingredient masters, suppliers, conversion rules, customer/order-template previews, and source traceability.

The app is not yet claimable as `100/100` because certification evidence still needs external email DNS/operator sign-offs, backup/restore or rollback drills, and other manual evidence. That is a certification evidence gap, not a current product-depth blocker.

Some older docs may be stale:

- `docs/audit-milestone.md` still has Milestone 11 items marked Todo, but Phase 003 and Phase 004 implemented those areas. Prefer `.planning/STATE.md` plus phase verification docs for current status.

## Product Map

The app supports these core workflows:

- Authenticated staff login with role-aware permissions.
- Dashboard command center with production queue, low-stock alerts, notifications, analytics, and smart suggestions.
- Inventory management with ingredient profiles, purchase units, supplier links, reorder levels, stock movements, FEFO lots, usage history, allergen profile, storage profile, and CSV export.
- Recipe management with products, recipe items, formula metadata, prep state per ingredient line, scaling, source-cost preservation from imported dish-costing recipes, costing profile, export, archive, and duplication-style workflows.
- Order management with multi-line orders, requested yield quantities, live stock/cost previews, reservation, release, production status, delivery status, and archive.
- Production planning grouped by recipe/date, with shortage blocking, batch review, start/complete actions, scaled recipe modal, and production QC log capture.
- Shopping list generation from active order demand plus reorder top-ups and safety margin, with editable purchase quantity, unit cost, supplier, notes, expiry, FEFO batch creation, purchase logs, and inventory movements.
- Costing and margins based on scaled ingredients plus labor, packaging, overhead, utility, failure allowance, and yield loss.
- Rule-based AI assistant for data-backed kitchen questions: what to buy, production blockers, recipe cost/margin, low stock, and recipe measurement conversion.
- Conversion library for ingredient-specific and state-scoped conversions, including import/export, verification, archive, and measured-source metadata.
- Supplier management with contact details, currency, lead times, supplied ingredient IDs, linked-record delete guard, and search.
- Settings, staff, audit reports, compliance exports, operations reports, archive recovery, and guarded Resend low-stock email logging/sending.
- Import onboarding: `#imports` lets operators paste text or upload files, extract a draft, review confidence/source evidence, resolve ingredients, and commit selected records through audited backend actions. Local deterministic extraction covers text, CSV/TSV, XLSX, DOCX, and text PDFs; image/scanned/legacy extraction needs the configured OCR/vision provider.

## Frontend Shape

Main files:

- `src/App.tsx`: monolithic React app, routing, pages, shared UI, auth/session state, mutation calls, dialogs, exports, reports.
- `src/lib/kitchen.ts`: pure-ish business logic for scaling, costing, conversion, shopping, stock checks, production queue, AI responses, and formatting.
- `src/lib/audit.ts`: audit redaction, changed-field summaries, search text, display labels, export rows.
- `src/lib/backend.ts`: API base URL selection.
- `src/data.ts`: in-memory singleton snapshot arrays and `setKitchenSnapshot`.
- `src/types.ts`: shared frontend domain contracts.
- `src/styles.css`: app styling, responsive layouts, mobile nav, tables/cards, forms, modals.
- `src/main.tsx`: React entry.

Pages in `src/App.tsx`:

- `welcome`
- `login`
- `dashboard`
- `imports`
- `recipes`
- `recipe-detail`
- `recipe-form`
- `scaling`
- `inventory`
- `ingredient-detail`
- `ingredient-form`
- `orders`
- `order-create`
- `order-detail`
- `production`
- `shopping`
- `costing`
- `ai`
- `conversions`
- `suppliers`
- `settings`

Routing is hash-based and session-aware. Unknown hashes fall back safely instead of preserving stale private content. Signed-in users default to Dashboard; signed-out users default to Login or Welcome. Session data is stored in `localStorage` under `pastry-county-session`.

Routing is now record-aware for durable workflows. Details/forms such as recipe detail/edit/scale, ingredient detail/edit, and order detail/edit/new serialize to hashes like `#recipes/<id>`, `#recipes/<id>/edit`, `#recipes/<id>/scale`, `#inventory/<id>`, `#inventory/<id>/edit`, `#orders/<id>`, and `#orders/<id>/edit`. Legacy page hashes still parse as compatibility aliases.

Navigation:

- Desktop uses a sidebar.
- Mobile uses a five-item bottom nav: Dashboard, Inventory, Orders, Production, and More.
- More opens access to Recipes, Shopping, Costing, AI Assistant, Conversions, Suppliers, and Settings.

Shared UI and interaction patterns:

- `Badge`, `Button`, `Section`, `Field`, `Toolbar`, `Chips`, `ResponsiveTable`, `PaginatedTable`, `FormShell`, `Metric`, `SummaryCard`, `EmptyState`.
- `useDialogA11y` traps focus, closes on Escape, returns focus to trigger, and makes background inert.
- Mutation calls go through `apiAction`, which sends the bearer token and emits global saving/refreshing status.
- CSV/print exports are client-side Blob downloads.

## Backend Shape

The app has Vercel-compatible API routes under `api/` and a local Express server under `server/index.js` that reuses the same API helpers.

Primary routes:

- `GET /api/health`: reports database availability.
- `POST /api/auth/login`: bcrypt password check, rate-limited, returns signed session token.
- `GET /api/bootstrap`: requires active signed session, loads Neon snapshot, filters sensitive admin data for non-admin roles.
- `POST /api/actions`: primary mutation endpoint, rate-limited, role-checked, audit-logged.

Legacy/thin routes still present:

- `POST /api/inventory-movements`: direct stock adjustment route with FEFO deduction planning.
- `POST /api/orders/[orderId]/produced`: direct production completion route.

Important backend files:

- `api/_auth.js`: HMAC session token creation/verification, active-session and revocation checks.
- `api/_db.js`: Neon connection, error response helper, live schema drift repair, snapshot loader.
- `api/_actions.js`: mutation action router, normalization helpers, permissions, audit writing, production logic, shopping persistence, email guards.
- `api/_imports.js`: Phase 006 import extraction and normalization for pasted text, CSV/TSV, XLSX, DOCX, text PDF, provider-backed image/scanned/legacy files, customer/order-template previews, confidence/warning/source evidence, and deterministic OCR mock coverage for tests.
- `api/_rateLimit.js`: in-memory rate-limit buckets for login/actions.
- `api/bootstrap.js`: authenticated snapshot loader and role-based snapshot filtering.
- `api/actions.js`: API wrapper around `handleAction`.
- `api/auth/login.js`: login route.
- `server/index.js`: local Express API/static server.
- `server/setup-db.js`: applies `db/schema.sql` and `db/seed.sql`.

Backend roles:

- `Owner/Admin`
- `Baker`
- `Inventory Manager`
- `Viewer`

Permissions exist in two places and should stay in sync when changing access rules:

- Frontend UI permissions: `permissionRoles` in `src/App.tsx`.
- Backend action permissions: `actionRoles` in `api/_actions.js`.

## Data Model

Database schema lives in `db/schema.sql`; seed data lives in `db/seed.sql`. Additive live schema drift repair also runs inside `api/_db.js` and some action paths.

Tables:

- `app_users`: staff users, bcrypt hashes, role, active flag, session revocation timestamp.
- `suppliers`: supplier details, default currency, lead time, supplied ingredient IDs, active flag.
- `ingredients`: pantry/packaging master data, base unit, purchase unit, current/reserved stock, reorder level, latest unit cost, supplier, expiry fields, allergen profile JSON, storage profile JSON, active flag.
- `products`: saleable products linked to recipes.
- `recipes`: product recipe header, base yield, instructions, formula metadata JSON, cost profile JSON, active flag.
- `recipe_items`: ingredient lines, quantity, unit, waste, notes, prep state JSON.
- `orders`: customer/order status, payment, production status, stock status, archive flag.
- `order_items`: order lines linked to products and recipes with requested yield and multiplier.
- `purchase_logs`: shopping purchases and cost-per-base-unit history.
- `ingredient_batches`: FEFO lots with quantity remaining and optional expiry.
- `inventory_movements`: stock ledger for purchases, production use, reservation, release, adjustment, waste, return, correction.
- `conversion_rules`: ingredient/unit conversion rules, measured confidence/source, verified flag, state/temperature/formula scope, active flag.
- `production_qc_logs`: actual-vs-expected yield, formula version, temperatures, bake/rest times, sensory notes, defects, next adjustment, pass/fail.
- `audit_logs`: before/after records for important mutations.
- `notification_events`: low-stock notification delivery/log events.
- `settings`: business profile, currency, deduction stage, negative-inventory flag, AI confirmation flag, rounding prefs, safety margin, tax, low-stock email.

Important indexes include ingredient category, movement lookup, FEFO lookup, audit lookup, order item lookup, recipe item lookup, conversion lookup/scoped lookup, and QC log order lookup.

## Business Logic Map

`src/lib/kitchen.ts` is the frontend calculation core:

- `formatNaira` preserves fractional NGN costs such as `0.50`.
- `formatQuantity` rounds count units for display and keeps measured-unit precision.
- `roundScaledQuantity` and `scaleRecipe` handle recipe scaling, waste, formula context, egg rounding preferences, and gram display for egg conversion mode.
- `convertUnit` handles direct conversions, ingredient-specific rules, and scoped conversion preference. Scoped rules match ingredient state, temperature state, and formula context before falling back to generic active rules.
- `checkStockAvailability` and `checkOrderStockAvailability` calculate shortages against current/reserved stock.
- `requirementsForOrderLines` and `requirementsForOrder` generate combined ingredient requirements.
- `calculateRecipeCost` combines ingredient costs, approved source-line costs where present, labor, packaging, overhead, utility, failure allowance, and effective-yield loss.
- `calculateOrderCost`, `calculateMargin`, and `netSellingPrice` support costing/margin views.
- `generateShoppingList` combines active-order requirements, low-stock top-ups, safety margin, supplier info, and estimated costs.
- `dashboardProductionQueue` separates due-today work from overdue/carryover work.
- `parseRecipeText` parses natural conversion prompts and recipe measurement lines.
- `buildKitchenAssistantResponse` is the rule-based AI assistant answer generator.
- `stockAdjustmentValidation` enforces positive quantity, no oversize removal, and explicit removal confirmation.

`api/_actions.js` is the backend mutation core:

- Validates actor session and DB-backed active/revoked status for mutations.
- Enforces role permissions for every action.
- Normalizes recipe formula metadata, recipe item prep state, ingredient allergen/storage profiles, recipe cost profile, conversion scope, shopping purchases, and production QC logs.
- Writes audit logs for create/update/archive/purchase/status/staff/notification operations.
- Repairs decimal operational columns and canonical audit conversion rules when needed.
- Handles FEFO deduction planning for manual removals and production use.
- Blocks production when shortages exist unless settings allow negative inventory.
- Makes production completion idempotent for already-produced orders.
- Maps low-level purchase persistence errors to user-safe messages.
- Logs or sends low-stock emails only when recipient, Resend key, and verified sender domain are configured.

## Main API Actions

Archive/recovery:

- `archive.list`
- `archive.restore`

Inventory:

- `ingredient.save`
- `ingredient.delete`
- `ingredient.restore`
- `inventory.adjust`

Suppliers:

- `supplier.save`
- `supplier.delete`

Recipes:

- `recipe.save`
- `recipe.delete`

Orders and production:

- `order.save`
- `order.reserve`
- `order.releaseReservation`
- `order.produce`
- `order.delete`
- `order.status`
- `production.batchStatus`

Shopping:

- `shopping.purchaseSuggested`

Conversions:

- `conversion.save`
- `conversion.verify`
- `conversion.delete`

Imports:

- `import.extract`
- `import.commit`

Settings/staff/notifications:

- `settings.save`
- `user.save`
- `user.disable`
- `user.revokeSessions`
- `notification.lowStockEmail`

Schema/maintenance:

- `schema.ensure`

When adding a new mutation, update backend permissions, frontend UI permissions if user-facing, validation, audit logging, tests, and smoke scripts if it affects audited workflows.

## Verification Surface

Local commands:

- `npm test`
- `npm run build`
- `npm run db:setup`
- `npm run dev`
- `npm run dev:server`
- `npm run start`
- `npm run preview`

On Windows PowerShell, prefer `npm.cmd` if the npm shim is blocked.

Smoke/audit scripts:

- `npm run smoke:milestone7`: Playwright coverage for login, mobile ingredient forms, shortage blocking, shopping controls, conversion editing, settings/mobile overflow, optional mutation checks.
- `npm run smoke:regression-audit`: live regression checks for sub-naira costs, purchase unit selection, FEFO lot decrement, oversized removal blocking, mobile modal fit, optional mutation data.
- `npm run smoke:phase2-rerun`: live checks for revoked Viewer bootstrap, Viewer filtering, fresh login persistence, exact AI conversions, Production 320px overflow, mobile structure.
- `npm run smoke:phase3-pastry`: live checks for formula metadata, prep state, egg scaling, exports, reload behavior.
- `npm run smoke:phase4-pastry-depth`: live checks for allergen/storage/cost/scoped conversion/QC fields and production completion with QC.
- `npm run smoke:navigation-routing`: live navigation/routing smoke for durable record links, form exits, unsaved-change guard, return context, and five-item mobile nav.
- `npm run smoke:import-onboarding`: live import smoke for `import.extract`, `import.commit`, source evidence reload, mobile import page overflow, CSV template visibility, and cleanup.
- `npm run smoke:live-audit`: umbrella live audit smoke. As of Phase 006 it runs Phase 002, Milestone 7, regression audit, Phase 003, Phase 004, navigation routing, and import onboarding smoke suites.
- `npm run audit:reconcile-fefo`: checks/fixes FEFO overstatements.

Current verified snapshot from `.planning/STATE.md` and Phase 006 verification:

- `npm.cmd test`: passed, 75 tests after Phase 006.
- `npm.cmd run build`: passed.
- `node --check scripts/phase4-pastry-depth-smoke.mjs`: passed.
- `git diff --check`: passed before Phase 004 commits and smoke hardening.
- `npm.cmd run smoke:phase4-pastry-depth`: passed against production.
- `npm.cmd run smoke:import-onboarding`: passed against production after Phase 006; temporary import recipe was archived.
- `npm.cmd run smoke:live-audit`: passed against production after Phase 006.
- Phase 005 navigation routing: implemented under `.planning/phases/005-navigation-routing-overhaul/`, including `NAVIGATION-INVENTORY.md`, and production-smoke verified.
- Phase 006 import onboarding: implemented under `.planning/phases/006-recipe-import-onboarding/` and production-smoke verified.

Use the live deployment for browser smoke tests when local env vars are unavailable. Read live test credentials only from ignored `.env.local`.

## Imported Dish Costing Recipes

`docs/dish-costing-recipe-approval.md` tracks the Google Sheets Dish Costing workbook import.

Current import state:

- Recipes 1-29 were owner-approved and imported into Neon on 2026-06-23.
- Recipes 30-34 remain pending owner approval.
- Price-list tabs with no recipe quantities are documented but not ready for import.

Import tooling:

- `scripts/import-approved-dish-costing-recipes.mjs`

The importer preserves source workbook metadata in recipe item prep state fields, including line names, sheet/workbook/revision, package quantity/price, needed quantity, and source line amount. `calculateRecipeCost` uses `sourceLineAmount` where present, so imported dish-costing recipes can preserve owner-approved costing instead of recalculating solely from latest ingredient unit cost.

## Security And Privacy Notes

- `/api/bootstrap` must require a signed active session. Unauthenticated requests should return 401 and no private snapshot.
- Session tokens are HMAC-signed, expire after 12 hours, and are invalidated when the corresponding user is disabled or `session_revoked_at` is newer than token issue time.
- Viewer/non-admin bootstrap snapshots must omit `appUsers`, `auditLogs`, and `settings.lowStockNotificationEmail`.
- Mutating actions must validate the actor against current DB user state.
- Rate limiting exists for login and actions.
- Audit exports/search must redact passwords, tokens, sessions, hashes, secrets, and API keys.
- User-visible API errors should be operationally clear and should not expose raw SQL/internal syntax.
- Low-stock email should not send externally unless `RESEND_API_KEY`, a non-onboarding verified `RESEND_FROM_EMAIL`, and a recipient are configured.
- `vercel.json` sets CSP, frame protection, MIME sniffing protection, Referrer-Policy, and Permissions-Policy headers.

## Operational Gotchas

- Do not assume local app smoke tests can run without `DATABASE_URL`; use production when local env is missing.
- The app is private and Vercel Hobby deployments may be blocked by commits from an unrecognized identity. Use the ADxZimmy noreply identity before committing.
- Keep schema changes additive. Update `db/schema.sql`, `api/_db.js` live drift repair, and any action-specific setup that writes the new fields.
- Keep `src/types.ts`, DB rows in `api/_db.js`, normalizers in `api/_actions.js`, and form fields in `src/App.tsx` aligned.
- `src/App.tsx` is intentionally large. Follow existing local patterns before introducing new abstractions.
- Any new audited workflow should get a unit/API test and, if production-facing, a live smoke assertion.
- Avoid committing generated `dist/` churn unless the repo already intentionally tracks it for the requested change. Check `git status` before staging.
- `docs/audit-milestone.md` is a historical milestone tracker and may lag the latest planning state.

## Where To Change Things

- New page or route: `Page` union, `pageIds`, nav arrays, `titleFor`, `content` switch in `src/App.tsx`, CSS as needed.
- New domain field: `src/types.ts`, `db/schema.sql`, `api/_db.js`, normalizer/persistence in `api/_actions.js`, UI form/detail/export in `src/App.tsx`, tests.
- New mutation: `api/_actions.js`, action permission map, frontend `apiAction` call, audit log, tests, smoke if live-critical.
- New role behavior: `permissionRoles` in `src/App.tsx`, `actionRoles` in `api/_actions.js`, bootstrap filtering if data exposure changes, tests.
- New calculation: prefer `src/lib/kitchen.ts` with unit tests in `src/App.test.ts`.
- New audit display/search/export behavior: `src/lib/audit.ts` with tests in `src/App.test.ts`.
- New DB-only setup: `db/schema.sql`, `db/seed.sql`, `server/setup-db.js` only if setup behavior changes.
- New live audit script: `scripts/`, `package.json`, and `scripts/live-audit-smoke.mjs` if it belongs in the umbrella smoke.

## Backlog / Next Likely Work

- Run a fresh external audit against the current production deployment if the user wants independent validation after Phase 006.
- Configure and verify the OCR/vision provider for production camera/photo/scanned imports, including cost and data-retention review.
- Scope a future direct order-import/order-template phase if the owner wants imported order rows to create active orders instead of preview-only onboarding data.
- Close the separate 100/100 certification evidence pack: email DNS/SPF/DKIM/DMARC proof, controlled email delivery, keyboard and screen-reader sign-off, backup/restore drill, rollback drill, monitoring/incident owner evidence.
- Resolve stale planning/milestone docs if the user wants docs cleaned up beyond this map.
- Finish any remaining personal/user-specific changes the owner had pending.

## Quick Orientation Summary

This is a strong, late-stage bakery operations app. The 95+ release gate has been cleared (`96/100` after Phase 002), Phase 003/004 pastry-depth work is live-smoke verified, Phase 005 corrected the navigation architecture, and Phase 006 added live-verified import onboarding. Future changes should be conservative, audited, route-aware, role-aware, tested locally, and smoke-tested against production when they touch live workflows.
