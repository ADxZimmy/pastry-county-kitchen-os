# Pastry County Kitchen OS Audit Milestone

This milestone tracks every finding from `App Audit Request.pdf`, `App Audit Request (1).pdf`, `App Audit Request (2).pdf`, `Audit Scope Expansion Request.pdf`, `Audit Scope Expansion Request UIUX.pdf`, and `Audit Expansion Request.pdf` and the work needed to move the audit from "Not Ready" to complete coverage.

Status legend:

- Done: implemented and verified in this branch.
- Partial: some coverage exists, but more work is needed.
- Todo: not yet implemented.

## Milestone 1 - Demo Blockers

| Status | Area | Audit Finding | Completion Criteria |
| --- | --- | --- | --- |
| Done | Recipe scaling | Gram values rounded incorrectly, e.g. 187.5g dark chocolate became 190g. | Scaling keeps one decimal for weights/volumes and rounds count units up only where sensible. Tests cover 0.75x brownie scaling. |
| Done | Dynamic costing | Costing used static values unrelated to the selected recipe. | Costing recalculates when the recipe/yield/selling price changes and uses live ingredient costs. |
| Done | Inventory validation | Negative stock was accepted, edits could reset cost to zero, and the stock-adjustment modal could fail silently when removals exceeded available stock. | UI/API reject negative stock, keep latest cost on edit, require valid numeric fields, and show inline adjustment errors with disabled invalid submits. |
| Done | Stock adjustment | Ingredient detail used fixed quick actions (+100g/-1g) without reason or history. | Stock changes use a quantity/reason modal and write inventory movement records. |
| Done | Order production guardrails | Orders could be produced despite shortages and inventory could be deducted incorrectly; the May 2026 follow-up found reservation/production inconsistent when units differed. | Production completion checks stock in base units, blocks invalid statuses, and deducts inventory once. |
| Done | Shopping list purchase | Marking purchased cleared items without inventory updates or visible failure. | Selected purchases update inventory, log purchases, keep unselected items, and surface API errors instead of silently failing. |
| Done | AI conversion prompts | AI conversion responses were static and used browser prompts. | Suggestions select ingredient-specific rules, editable values are in-app, and rules save through the API. |
| Done | Supplier prompt flow | Add Supplier used `prompt()` and could leave the SPA. | Supplier add/edit uses an in-app form with contact, address, currency, and notes. |
| Done | Search state | Search terms persisted when switching modules. | Navigation clears the shared search query. |
| Done | Edit form cancellation | Updated audit found Cancel on Edit Ingredient could open `chrome://newtab` and leave the SPA. | Form cancellation now routes explicitly to the relevant app page instead of using browser history. |

## Milestone 2 - MVP Reliability

| Status | Area | Audit Finding | Completion Criteria |
| --- | --- | --- | --- |
| Done | Shopping list | Shortage calculations need broader real-order coverage, editable purchase cost, and non-zero estimates where costs are missing. | Shopping list normalizes order requirements to base units, aggregates active demand and low-stock top-ups, supports editable quantities/prices, supplier assignment, purchase notes, expiry dates, and fallback estimates for missing costs. |
| Done | Order reservation | Reservation is all-or-nothing. Audit requested partial reservation. | Operators can reserve available stock, see remaining shortages, and reserve the remainder after stock is purchased. |
| Done | Production module | Production page still needs deeper task workflow, and updated audits reported shortage orders could still be progressed or production actions appeared cosmetic. | Orders are grouped by recipe/date, batch quantities are calculated, grouped batches start/complete through the API, production consumes stock using FEFO lots, and shortage/error states are blocked with visible feedback. |
| Done | Supplier management | Supplier CRUD exists, but supply catalogs and lead times are missing. | Suppliers can be linked to supplied ingredients, lead time, currency, and preferred ordering notes. |
| Done | Settings | Settings page exists for core preferences, but more settings are needed. | Business profile, currency/unit preferences, rounding, deduction timing, AI confirmation, safety margin, notification email, and tax defaults persist; safety margin affects shopping and tax affects margin previews. |
| Done | Conversion library reuse | Conversion rules save, but recipe-builder reuse is incomplete. | Recipe entry applies saved conversion rules on save and the parser still highlights entries needing review. |
| Done | Stock/audit logs | Inventory movements exist, but broad audit history is incomplete. | Entity changes write before/after audit records, inventory movements remain the stock ledger, and ingredient details/settings expose recent audit history. |
| Done | Expiry and batch tracking | Expiry dates and batch tracking are missing or shallow. | Purchases create ingredient lots with optional expiry dates, ingredient detail shows FEFO order, and production consumes oldest expiring lots first. |
| Done | Delete undo | Some destructive actions confirm, but undo is not universal. | Destructive actions archive where possible, Settings exposes recovery, and ingredients, recipes, orders, suppliers, and conversion rules can be restored. |

## Milestone 3 - UX, Mobile, Accessibility, Performance

| Status | Area | Audit Finding | Completion Criteria |
| --- | --- | --- | --- |
| Done | Responsive tables | Tables convert to cards, but mobile layout needs a full QA pass. | Inventory, orders, shopping, conversions, and forms use mobile cards, safer wrapping, and tighter controls for 360px-class screens. |
| Done | Accessibility | Labels/focus exist in many places, but audit requested full WCAG pass. | Tables expose column scopes, empty states are explicit, loading uses `aria-busy`, row controls avoid accidental activation, and recovery/shopping controls have accessible names. |
| Done | Modal mobile behavior | Some modals/forms may still overflow on small screens. | Modals now constrain height, scroll within the viewport, and keep Save/Cancel reachable on small screens. |
| Done | Performance | Audit found slow load, large bundle, and missing skeleton states. | Loading states use skeletons, empty/error states are graceful, the production bundle remains about 71KB gzip after Milestone 4 UI additions, and blocking prompt/modal flows were removed. |
| Done | Desktop density | Desktop views can feel stretched and sparse. | 1440px+ layouts use denser grids and constrained detail/form columns while preserving readable tables. |
| Done | Back navigation | Latest audit found browser Back could return to the welcome page and lose app context. | Hash routes now push browser history entries and `popstate` restores the matching internal page while preserving the signed-in session. |

## Milestone 4 - Product Completeness

| Status | Area | Audit Finding | Completion Criteria |
| --- | --- | --- | --- |
| Done | Authentication | Login exists, but route protection/roles are not complete. | Login uses signed API sessions, signed-in users persist locally, private app pages require a session, role-aware controls are disabled in the UI, and mutating API actions enforce role permissions server-side. |
| Done | Notifications | Low stock/order reminders are missing and latest audit requested actionable/dismissible alerts. | Dashboard shows active low-stock, due-order, shortage, and expiry notifications with Open/Dismiss actions plus a shareable digest. |
| Done | Exports | Recipe/order/shopping exports are incomplete. | CSV exports are available for inventory, recipes, and orders; shopping list export/share remains available. |
| Done | Multi-currency/tax | Only NGN is effectively supported. | Currency persists from Settings and all shared cost/margin displays use the selected currency; tax remains applied in margin previews. |
| Done | Analytics | Advanced dashboards are missing. | Dashboard analytics now show produced orders, active order cost, stock value, waste events, most-used ingredient, open shortages, supplier performance, FEFO lots, and waste report cards. |
| Done | Staff management | Roles are enforced, but staff account management is missing. | Settings now lists staff users, supports Owner/Admin staff add/edit/disable, and disabled users cannot log in. |
| Done | Compliance reports | Audit history is visible but not filterable/exportable. | Settings now includes audit filters, CSV export, and printable compliance report exports. |
| Done | PDF/print exports | Branded PDF exports are missing. | Printable HTML report exports are available for compliance and operations reports and open through the browser print/PDF flow. |
| Done | Email alert delivery | Low-stock notification email is configured but not actionable. | Low-stock alerts send through Resend with a branded operational template when `RESEND_API_KEY` is configured, otherwise they are logged with a clear missing-key status. |

## Milestone 5 - Scope Expansion Audit Wrap-Up

| Status | Area | Audit Finding | Completion Criteria |
| --- | --- | --- | --- |
| Done | Scaled recipe orders | Creating an order from the scaling page defaulted to Classic Brownies instead of the scaled recipe. | Scaling now creates an explicit order draft with the selected recipe and desired yield, clears edit mode, and the new order form no longer borrows the first existing order. |
| Done | Production review | Review Batch only showed a toast and batch actions did not clearly show lifecycle state. | Grouped batches now show Ready, In Progress, Completed, or Shortage, expose a review modal with ingredient availability, and disable invalid start/complete actions with visible shortage feedback. |
| Done | Conversion editing | Conversion Library edit did not expose an obvious editable form. | Edit/Add conversion opens a modal form with clearer "Value for 1 unit" labeling and verified values save as booleans. |
| Done | Recipe/order field clarity | Recipe ingredient rows had an unexplained numeric `0` field and dense order item inputs. | Builder rows now have visible labels for Ingredient/Product, Quantity/Yield, Unit, Waste %, and Multiplier, plus conversion helper text. |
| Done | Shopping list select all | Select All did not act like a single reliable toggle. | Select All now toggles all visible unique ingredients at once and becomes Clear All when everything is selected. |
| Done | Staff form behavior | Add Staff cancel/toggle left the form feeling open. | Staff action toggles between Add Staff and Close Staff Form, and Cancel collapses the form. |
| Done | Supplier search | Supplier management lacked search/filtering. | Suppliers can be searched by supplier, contact, phone, email, or supplied item. |
| Done | Audit log search | Audit Reports filtered by entity but lacked search within logs. | Audit Reports now include text search across entity, record, action, actor, and date. |
| Done | UI contrast/responsiveness | UI was too beige/brown, dense tables wrapped awkwardly, and shopping/audit still scrolled on narrower screens. | Added muted teal accents/focus states, stronger muted text contrast, labeled dense rows, and card/table breakpoint improvements for shopping/audit-style screens. |

## Milestone 6 - Live Audit Expansion Follow-Up

| Status | Area | Audit Finding | Completion Criteria |
| --- | --- | --- | --- |
| Done | Add order preview | Add Order did not update ingredient requirements, stock availability, cost, or margin while products were entered. | Order item rows are controlled, recalculate requirements/cost live from selected recipes, and preserve scaled-recipe drafts. |
| Done | Production scaled recipe | Production card View Scaled Recipe routed to order detail instead of showing the recipe quantities. | View Scaled Recipe opens a production modal with requested yield, scale factor, cost, and ingredient quantities. |
| Done | Ingredient usage history | View Usage only displayed a toast. | View Usage opens a filterable/exportable usage modal with event counts and usage totals. |
| Done | Add stock FEFO lots | Add Stock lacked expiry entry and the audit flagged modal confusion after saving. | Add Stock now accepts optional expiry date, creates an ingredient lot for purchase movements, shows a success toast, reloads data, and closes on success. |
| Done | Shopping list editing | Quantity/cost edits could reset and select-all felt unreliable. | Shopping drafts store input text locally until blur, selected purchase totals derive from draft values, and the visible-item toggle remains keyed to unique ingredient IDs. |
| Done | Conversion bulk export | Conversion editing/export was incomplete. | Conversion Library now exports rules to CSV; existing modal supports ingredient/unit/value/source/confidence/verified edits. |
| Done | Minor UI placeholders | Ingredient cost summary showed a hard-coded price trend placeholder and count units could display decimals. | Placeholder removed, purchase trend text is derived from movement history, and displayed count units round to whole units. |

## Milestone 7 - 95+ Score Push

Latest audit source: `Audit Request Expansion.pdf`, score 71/100 on May 29, 2026. Target: 95+/100 by eliminating all critical/high items, closing the most visible medium issues, and proving the fixes through local and live smoke tests.

| Status | Area | Audit Finding | Completion Criteria |
| --- | --- | --- | --- |
| Done | Real AI assistant | AI Assistant had suggested prompts and conversion widgets, but no real chat area for operational questions. | AI page has a conversational input, message history, and data-backed answers for shopping, shortages, costing, low stock, and pasted recipe measurements. |
| Done | Production hard block | Audit reports Start Batch can proceed with shortages. | Batch and order production actions are disabled and API-blocked when shortages exist; shortage toast names exact ingredients and offers Shopping List route. |
| Done | Rounding consistency | Scaling/order/costing display can disagree for decimals and count units. | A shared display/calculation utility is used across scaling, ordering, costing, production, and tests cover 0.5x, 0.75x, and 1.5x brownie scaling. |
| Done | Shopping purchase reliability | Mark purchased can appear to succeed without inventory updates. | Purchase action validates positive quantity/cost, keeps rows until API success, shows error toast on failure, and test covers quantity/cost/expiry update. |
| Done | Supplier deletion feedback | Linked supplier deletion can fail silently. | Linked suppliers either have Delete disabled with guidance or server/client show a specific linked-ingredient error. |
| Done | Mobile forms/modals | 360px mobile forms and modals can overflow or hide Save/Cancel. | Add/edit ingredient, stock adjustment, supplier, conversion, production review, and settings forms now use mobile-safe grids, internal modal scroll, sticky dialog actions, and overflow-resistant card/button sizing. |
| Done | Empty recipe validation | Blank recipes can be created without ingredients. | Recipe save requires at least one valid ingredient line and shows inline errors before API submission. |
| Done | Audit details | Audit rows are searchable/paginated but do not expose before/after detail. | Audit rows expand to show before/after JSON or meaningful summaries; export includes detailed values where available. |
| Done | Global loading/errors | Route changes/API failures can show blank states or silent failures. | API mutations emit a shared saving status, refresh failures keep the current screen with a stale-data warning, and form/confirm failures render inline errors instead of browser alerts or blank states. |
| Done | Mobile navigation | Audit requests bottom navigation and better touch targets. | Mobile has persistent bottom nav for key modules and all table/form actions meet 44px touch target expectations. |
| Done | Verification coverage | Audit recommends critical E2E tests. | `npm run smoke:milestone7` provides Playwright coverage for login, mobile ingredient forms, production shortage blocking, shopping purchase controls, conversion editing, settings/mobile overflow, and optional mutation checks for purchase/order creation. |

## Milestone 8 - Regression Audit Recovery

Latest audit source: `Audit report.pdf` / `audit.txt`, score 63/100 on June 12, 2026. Root cause: the external audit used stricter mutation checks than the previous smoke pass, exposing precision, persistence, and FEFO-lot regressions that were not pinned by tests.

| Status | Area | Audit Finding | Completion Criteria |
| --- | --- | --- | --- |
| Done | Low-cost precision | Ingredients with unit costs below 1 were rounded up in cost displays, e.g. `0.5/g` rendered as `₦1/g`. | Shared currency formatting preserves two decimals for fractional costs while keeping whole-naira values compact; tests cover `0.5`, `0.64`, `2.75`, and whole-unit values. |
| Done | Purchase unit persistence | Purchase Unit looked ineffective because the selector state was not preserved as a first-class ingredient field. | Ingredients store `purchaseUnit`, the form selector is controlled and visibly responsive, exports/detail screens expose the saved value, and purchase quantity converts kg/g and litre/ml into the base unit before costing/stock updates. |
| Done | FEFO manual removals | Manual negative stock adjustments reduced current stock but did not decrement FEFO lot quantities. | Manual removals plan deductions against lots in FEFO order and update `ingredient_batches.quantity_remaining`; API tests cover multi-lot and capped deduction behavior. |
| Done | Invalid removals | Audit flagged saves that appeared clickable or silent when removing more than available stock. | Adjustment UI keeps invalid removal submits disabled and the API still rejects stock-negative mutations. |
| Done | Destructive stock removal confirmation | Security notes flagged Adjust Stock removals as destructive actions without explicit confirmation. | Valid stock removals now require an in-modal acknowledgement that stock, FEFO lots, and movement history will change; shared validation tests cover empty, oversized, unconfirmed, and confirmed removals. |
| Done | Count-unit display consistency | Count-based items could show confusing decimal quantities or mismatched rounding across reports. | Shared quantity formatting rounds count units to whole display values while preserving decimal precision for measured units; tests cover `pcs`, `pack`, and grams. |
| Done | Dashboard metric fit | Six dashboard metric cards could clip or crowd long currency values such as shopping estimates. | Long metric values size from the card width and stay on one line without overflowing the card. |
| Done | FEFO production consumption | The audit found no proof that production consumes the oldest available lots. | Production and manual removals use the same FEFO-ordered batch deduction planner; tests cover multi-lot deduction order and capped deductions. |
| Done | Recipe builder usability | Ingredient selection required scrolling through long ungrouped dropdowns and mobile recipe entry was cumbersome. | Recipe rows now include ingredient search, category-grouped options, visible labels, and mobile-safe row spacing while retaining saved conversion-rule handling. |
| Done | Mobile modal overflow | Add Stock and other modals could require both page and dialog scrolling on 360px screens. | Dialog scrolling is contained inside the modal, controls retain 44px+ tap targets, and sticky modal actions remain reachable on mobile. |
| Done | Conversion library integration | Conversion rules were not clearly proven to be reused during recipe entry/costing and editing/export looked static. | Recipe costing normalizes non-base ingredient units with saved conversion rules, recipe save applies verified conversions, conversion edit/export remain active, and tests cover rule reuse in recipe costing. |
| Done | AI assistant verification | AI chat existed but was marked unverified and possibly static. | Assistant response logic now lives in the shared kitchen library and tests prove data-backed answers for shopping, production blockers, recipe costing, conversion parsing, and low-stock inventory. |
| Done | Production guardrail verification | Production and reservation guardrails were marked unverified by the audit. | Existing UI/API shortage blocks remain in place, API tests prove shortage and reservation ownership rules, and smoke now asserts shortage batches keep Start/Complete disabled. |
| Done | Shopping and role verification gaps | The audit matrix marked shopping purchases and server-side role enforcement as not verified. | Shopping purchases now validate every selected row for ingredient, positive quantity, positive unit cost, supplier fallback, expiry, and derived unit cost; API tests also cover role boundaries for shopping, production, settings, staff, and unknown actions. |
| Done | Archive and audit export verification | Archive/recovery and audit export were marked untested in the audit matrix. | Archive restore now validates every recoverable entity type through a tested API mapper; audit report export/search/detail helpers are shared and tested for changed-field summaries plus redaction of passwords, tokens, hashes, sessions, and API keys. |
| Done | Staff session enforcement verification | Staff management and disabled-user behavior were marked untested. | API permission tests now cover Owner-only staff save/disable/session revocation, missing actors, disabled users, missing users, revoked sessions, and active sessions issued after revocation. |

## Milestone 9 - June 22 Live Audit Production Readiness Recovery

Latest audit source: Codex audit session `019eeee0-894f-7880-b3fa-4a7c002de3ab`, saved report `pastry-county-kitchen-os-live-audit-2026-06-22.md`, score 72/100 on June 22, 2026. Root cause: prior milestone claims were stronger than live production behavior; the new audit verified core bakery math but found security, live-schema, conversion, mobile accessibility, and verification gaps.

| Status | Area | Audit Finding | Completion Criteria |
| --- | --- | --- | --- |
| Done | Bootstrap API security | Unauthenticated `GET /api/bootstrap` exposed suppliers, staff records, orders, movements, batches, audit logs, conversion rules, and settings. | `/api/bootstrap` now requires a valid signed session, unauthenticated production requests return 401 with no private data, authenticated app loading sends the bearer token, session expiry redirects to login, and unit/build/live verification passes. |
| Done | Decimal shopping costs | Shopping purchase with `unitCost: 0.5` failed on live with an integer parsing error. | Decimal unit costs `0.5`, `0.64`, `2.75`, and whole values now persist end-to-end in purchase logs, latest ingredient cost, inventory movements, and FEFO lots; live schema drift is reconciled and raw database syntax no longer reaches the user. |
| Done | Conversion rule correctness | Flour had duplicate verified `1 cup = 125g` rules while audit expects `1 cup = 120g`. | Active verified rules are unique by ingredient/from/to, flour/sugar/cocoa/egg/yolk/white/coconut-oil audit conversions match expected values, and duplicate live rules were archived with audit history. |
| Done | AI conversion parsing | Natural prompts like `Convert 1 cup sugar to grams` parsed into nonsensical `1 g -> 1g` answers. | AI parser recognizes conversion questions with quantity, unit, ingredient, and target unit; tests cover all audit prompts, and production serves the deployed bundle that includes the parser fix. |
| Done | Mobile shopping accessibility | Shopping checkboxes were 22px and desktop/mobile duplicate controls were both exposed to assistive technology. | Shopping controls meet 44px touch targets at 320-430px, only the active responsive representation is rendered, and Playwright checks cover unique purchase labels, mobile card exposure, and no horizontal overflow. |
| Done | Modal keyboard behavior | Production review modal does not close on Escape. | Review Batch, View Scaled Recipe, conversion, stock adjustment, and confirm dialogs close on Escape, trap focus, keep background inert, and return focus to the trigger. |
| Done | Unknown route fallback | Unknown hash routes keep stale content under an invalid URL. | Unknown hashes redirect to dashboard or show a safe not-found state without stale page content; tests cover direct invalid hashes and back/forward behavior. |
| Done | Dashboard date freshness | Today's Production shows May 2026 orders on the June 22, 2026 audit date. | Dashboard filters today's production by the actual current date and separates overdue/completed orders from today's queue. |
| Done | Audit display-name search | Audit search by created ingredient name did not find the human-readable record. | Audit rows/search/export include safe display names and changed-field summaries while preserving sensitive-data redaction. |
| Done | User-safe errors | Fractional-cost failure surfaced raw SQL-ish text to the user. | API errors are mapped to operationally clear messages; raw database syntax stays out of toasts and responses. |
| Done | Verification gaps | Manual stock adjustment, repeated production deduction idempotency, role-filtered bootstrap, and low-stock email delivery were not fully verified. | Add targeted tests/smoke coverage; avoid sending real external email unless a controlled test inbox is configured. |

## Milestone 10 - June 22 Audit Rerun Blocker Fixes

Latest audit source: Codex audit session `019eeee0-894f-7880-b3fa-4a7c002de3ab`, saved report `pastry-county-kitchen-os-rerun-audit-2026-06-22.md`, score 76/100 on June 22, 2026. Root cause: Phase 001 improved the original 72/100 findings, but the rerun found remaining DB-backed session validation, fresh-login persistence, AI prompt parsing, and mobile structure gaps.

| Status | Area | Audit Finding | Completion Criteria |
| --- | --- | --- | --- |
| Done | Revoked bootstrap sessions | Revoked Viewer tokens can still call authenticated `/api/bootstrap` and receive the full kitchen snapshot. | `/api/bootstrap` uses DB-backed active/revoked-session validation in serverless and Express routes; old revoked tokens return 401 with no snapshot; low-privilege snapshots omit admin-only staff/session/audit data. |
| Done | Fresh login persistence | Fresh browser login succeeds at the API layer but returns to `#login` with `Session expired` because no user/token is stored. | Login writes the returned user/token synchronously before first bootstrap, Dashboard loads from empty browser storage, and `pastry-county-session.user.token` exists after login. |
| Done | AI chat conversion prompts | Natural prompts like `Convert 1 cup sugar to grams.` still return `1 g -> 1g` style answers in production. | AI chat routes natural conversion questions through verified conversion rules, handles punctuation/plurals/large eggs, and live prompts return expected audit quantities. |
| Done | Production 320px overflow | Production still has `htmlOverflow` and `bodyOverflow` at 320x568. | Production has no horizontal overflow at 320/360/390/414/430px while preserving 44px action targets. |
| Done | Mobile structural accessibility | Axe flags `aria-allowed-role` on mobile cards and heading-order issues on Production. | Mobile table cards use semantic list markup or valid ARIA ownership, and Production headings follow a valid hierarchy across mobile widths. |

## Milestone 11 - Pastry Formula Depth

Latest source: Codex session `019eeee0-894f-7880-b3fa-4a7c002de3ab`, Baking and Pastry Arts audit on June 23, 2026. Context: the preceding external audit rerun 2 scored `96/100` and cleared the 95+ release gate; this milestone tracks product-depth work needed to make ingredient and recipe workflows behave like professional pastry formula systems.

| Status | Area | Audit Finding | Completion Criteria |
| --- | --- | --- | --- |
| Todo | Egg scaling preference | Settings expose egg rounding/gram conversion, but egg/yolk/white scaling always rounds up. | `nearest_whole_egg` and `allow_gram_conversion` produce distinct tested outputs; UI copy explains count vs gram behavior; existing non-egg scaling stays stable. |
| Todo | Recipe formula metadata | Recipes store yield, instructions, and notes but no structured oven temp, bake time, pan profile, mixing method, rest/chill/cool windows, target doneness, or sensory checkpoints. | Recipes save/load structured formula profile metadata; existing recipes remain compatible; recipe detail/scaling views surface the profile without mobile overflow. |
| Todo | Recipe ingredient prep state | Recipe items only store ingredient, quantity, unit, waste %, and notes, losing state such as cold cubed butter, melted butter, sifted flour, divided sugar, roasted nuts, or room-temperature eggs. | Recipe item lines can capture component/stage/sequence/prep-state metadata and show it in recipe detail and scaling outputs. |
| Todo | State-scoped conversions | Conversion rules are ingredient-specific but not state-specific enough for flour, cocoa, powdered sugar, nuts, brown sugar, and chocolate. | Conversion rules can document measured state/standard such as sifted, packed, chopped, melted, brand, sample count, and source confidence. |
| Todo | Expanded costing | Costing only sums scaled ingredient usage against latest unit cost. | Recipe/order costing can include configurable labor, packaging, oven/fuel overhead, failed-batch allowance, trim loss, and actual yield variance. |
| Todo | Allergen and storage controls | Ingredient master lacks structured allergen, dietary, cross-contact, storage-zone, shelf-life, and temperature fields. | Ingredients can record common allergen/dietary/storage controls and expose them in recipe/production/shopping contexts. |
| Todo | Production QC logging | Production completion deducts stock and marks orders produced but does not capture actual yield, temperature, bake time, defects, rework, retained sample, or sensory notes. | Production completion can record a QC log with actual vs expected yield, process temperatures/times, defects/rework, sensory notes, and next adjustment. |

## Validation Checklist

- [x] Unit tests passed with `npm test`.
- [x] Production build passed with `npm run build`.
- [x] Browser smoke check passed against the local built server.
- [x] No `window.prompt()` usage remains in `src`, `api`, or `server`.
- [x] Browser smoke checked production batches, supplier catalog fields, settings fields, and costing tax display.
- [x] Browser smoke checked recovery archive loading and restore controls.
- [x] API smoke checked archive listing and audit-log writes.
- [x] Updated audit PDF reviewed and mapped to fixes for Cancel navigation, shortage delivery guardrails, and shopping aggregation/cost estimates.
- [x] Browser smoke checked login, form cancellation, and rebuilt shopping-list cost rows after updated audit fixes.
- [x] Third audit PDF reviewed and mapped to fixes for base-unit order requirements, production/shopping feedback, stock-adjustment validation, back navigation, and latest-purchase cost fallback.
- [x] Role/session hardening added with signed login tokens, authorization headers, server-side action permissions, and role-aware disabled UI controls.
- [x] Dashboard notifications are now actionable and dismissible.
- [x] Staff management, audit filters/exports, printable reports, FEFO/waste/supplier reports, branded Resend low-stock alert delivery, and staff session revocation added.
- [x] Mobile/responsive controls verified through the responsive table/card implementation and browser smoke.
- [x] Keyboard/accessibility pass covered visible focus, table scopes, named controls, modal scrolling, loading state, and recovery actions.
- [x] Scope expansion audit PDFs reviewed and mapped to scaled-order, production, conversion, staff, supplier, audit-search, and UI responsiveness fixes.
- [x] Live audit expansion PDF reviewed and mapped to order-preview, production scaled-recipe, usage-history, stock modal, shopping edit, conversion export, and polish fixes.
- [x] Post-audit large-list polish added for conversion rules and audit logs.
- [x] Latest 71/100 audit reviewed and mapped into Milestone 7 95+ score plan.
- [x] AI assistant chat smoke checked locally with live shopping-list response.
- [x] Milestone 7 reliability pass added production shortage details, positive shopping purchase validation, supplier delete guards, empty recipe validation, and rounding/parser tests.
- [x] Audit reports now expose expandable before/after details and include redacted detailed values in CSV export.
- [x] Mobile bottom navigation now keeps Production and Shopping one tap away with 44px+ touch targets.
- [x] App-level saving/refreshing status and stale-data warnings added for shared loading/error feedback.
- [x] Mobile form/modal overflow guardrails added for 360px-class screens.
- [x] Milestone 7 Playwright smoke script added as `npm run smoke:milestone7`; run with `LIVE_TEST_EMAIL` and `LIVE_TEST_PASSWORD`, plus `MILESTONE7_SMOKE_MUTATE=1` for mutation checks.
- [x] Milestone 7 live smoke passed against production in read-only mode with `npm run smoke:milestone7`.
- [x] Regression audit precision and FEFO unit tests passed with `npm test`.
- [x] Regression audit production build passed with `npm run build`.
- [x] Milestone 7 smoke script now asserts purchase-unit selection and oversized stock-removal disabling.
- [x] Recipe builder search/grouping and mobile modal containment added for the detailed audit usability findings.
- [x] Milestone 7 smoke script now asserts shortage production batch actions stay disabled.
- [x] API tests now cover production shortage blocking, same-order reservation consumption, and other-order reservation exclusion.
- [x] Shared quantity formatting and conversion-rule recipe costing tests added for the remaining Top 10 findings.
- [x] API tests now cover shopping purchase validation and server-side role permission boundaries from the audit matrix.
- [x] Destructive stock removals now require explicit confirmation and shared validation tests.
- [x] AI assistant responses are now shared-library logic with tests for shopping, shortages, costing, conversions, and low stock.
- [x] Archive restore mapping and audit export/redaction helpers are now covered by unit tests.
- [x] Staff/session enforcement tests now cover disabled users and revoked sessions.
- [x] Regression audit live smoke script added as `npm run smoke:regression-audit`; run with `LIVE_TEST_EMAIL`, `LIVE_TEST_PASSWORD`, and `REGRESSION_AUDIT_SMOKE_MUTATE=1` to create/archive temporary AUDIT-Smoke ingredients and verify sub-naira costs, purchase-unit selection, FEFO lot decrement, oversized-removal blocking, and mobile modal fit. On PowerShell, use `$env:REGRESSION_AUDIT_SMOKE_MUTATE="1"; npm run smoke:regression-audit`.
- [x] Live production data checked for regression-era FEFO drift; `AUDIT-Flour` lot remaining was reconciled from `5,000g` to `4,800g` with an audit record using `npm run audit:reconcile-fefo`.
- [x] Authenticated live smoke re-run against production using a temporary Owner/Admin smoke account; `npm run smoke:milestone7` passed in read-only mode and `$env:REGRESSION_AUDIT_SMOKE_MUTATE="1"; npm run smoke:regression-audit` passed with temporary AUDIT-Smoke ingredients archived afterward.
- [x] Repeatable pre-audit runner added as `npm run smoke:live-audit`; it creates a temporary Owner/Admin smoke user, runs both authenticated live smoke suites, removes the user, and verifies no active AUDIT-Smoke data or FEFO overstatements remain.
- [x] `npm run smoke:live-audit` passed against production and verified cleanup: zero temporary smoke users, zero active AUDIT-Smoke ingredients, and zero FEFO overstatements.
- [x] External audit handoff captured in `docs/audit-handoff.md` with current commit, live URL, passed checks, and retest focus areas.
- [x] Production verification baseline confirmed as `READY` on Vercel for commit `b3cc35a011078f2d95a67d8ab9c275cd43d2142a`; GitHub reported the Vercel deployment status as successful and live `/api/health` returned 200.
- [x] June 22 live audit reviewed and mapped into GSD Hybrid Phase 001 plus Milestone 9 production-readiness recovery plan.
- [x] Phase 001 bootstrap authentication fix passed locally with `npm test` and `npm run build`.
- [x] Phase 001 bootstrap authentication fix passed live verification: unauthenticated `/api/bootstrap` returns 401 and authenticated owner bootstrap returns 200.
- [x] Phase 001 decimal shopping-cost failure reproduced live against a temporary `AUDIT-Decimal` ingredient, then local schema-repair and safe-error tests passed with `npm test` and `npm run build`.
- [x] Phase 001 decimal shopping-cost fix passed live verification for `0.5`, `0.64`, `2.75`, and whole-value unit costs, with purchase movements, latest ingredient cost, FEFO batches, and cleanup confirmed.
- [x] Phase 001 conversion drift reproduced live, then local conversion-rule reconciliation and natural AI conversion parsing passed with `npm test` and `npm run build`.
- [x] Phase 001 conversion/AI fix passed live verification: `schema.ensure` repaired and deduped production conversion rules, and production serves the parser-fix frontend bundle.
- [x] Phase 001 mobile shopping accessibility passed live Playwright verification at 320/360/390/414/430px: unique purchase labels, 44x44 checkbox hit targets, mobile cards only, and no horizontal overflow.
- [x] Phase 001 modal keyboard behavior passed local tests/build and live Playwright verification: Review Batch, View Scaled Recipe, stock adjustment, conversion edit/import, and confirm dialogs close on Escape, trap focus, keep background inert, return focus to the trigger, and restore inert state after close.
- [x] Phase 001 route/date behavior passed local tests/build and live Playwright verification: unknown hashes normalize to `#dashboard` without stale content, and Dashboard separates true due-today production from overdue/carryover work on the June 22 audit date.
- [x] Phase 001 audit display-name search passed local tests/build and live Playwright verification: fresh `AUDIT-Display-*` audit rows were searchable/exportable by display label while sensitive keys remained redacted.
- [x] Phase 001 final verification gaps passed local tests/build and live verification: repeated production is idempotent, signed Viewer bootstrap access is covered, low-stock email delivery guards do not send uncontrolled external email, user-safe purchase error mapping is tested, authenticated regression smoke passed, and manual stock adjustment FEFO behavior is live-verified.
- [x] Phase 001 full live-audit smoke passed against production with the configured live test account fallback: Milestone 7 smoke passed, regression-audit mutation smoke passed, and child smokes archived their temporary data.
- [x] External audit rerun reviewed: latest score is 76/100 with remaining revoked bootstrap, fresh login, AI conversion, Production overflow, and mobile structural accessibility blockers.
- [x] Phase 002 revoked bootstrap session validation implemented and live-verified.
- [x] Phase 002 fresh login persistence implemented and live-verified.
- [x] Phase 002 AI conversion prompt repair implemented and live-verified.
- [x] Phase 002 Production 320px overflow and mobile structural accessibility fixes implemented and live-verified.
- [x] Phase 002 full live-audit smoke passed against production with Phase 002, Milestone 7, and regression-audit checks.
- [x] External audit rerun 2 passed after Phase 002: score `96/100`, ready for 95+ release gate, zero findings/failing checks/advisory failures/request failures/console warnings.
- [x] Baking and Pastry Arts audit reviewed and mapped into Milestone 11 plus GSD Hybrid Phase 003.
- [ ] Implement Phase 003 Pastry Formula Depth.

## Next Recommended Work

1. After the user's personal changes, implement GSD Hybrid Phase 003: egg scaling correctness, recipe formula metadata, and recipe-item prep state.
2. Sequence the remaining Milestone 11 P2 items into a follow-up phase: state-scoped conversions, expanded costing, allergen/storage controls, and production QC logging.
3. Keep `npm run smoke:live-audit` green before production handoff.
4. Close separate 100/100 certification evidence by adding SPF/DNS proof and completing manual operator sign-offs.
5. Restore durable `LIVE_TEST_EMAIL` and `LIVE_TEST_PASSWORD` in the ignored local env file only if routine non-temporary smoke accounts are preferred.
