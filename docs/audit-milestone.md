# Pastry County Kitchen OS Audit Milestone

This milestone tracks every finding from `App Audit Request.pdf`, `App Audit Request (1).pdf`, `App Audit Request (2).pdf`, `Audit Scope Expansion Request.pdf`, and `Audit Scope Expansion Request UIUX.pdf` and the work needed to move the audit from "Not Ready" to complete coverage.

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
- [ ] Re-run an external audit after the scope expansion patch is live.

## Next Recommended Work

1. Re-run the external audit against the live deployment after this scope expansion patch is live.
2. Watch the first few Resend deliveries from the verified domain for spam placement and DMARC aggregate reports.
3. Close any new external audit findings in this milestone file before marking the audit cycle complete.
