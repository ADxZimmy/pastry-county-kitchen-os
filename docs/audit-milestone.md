# Pastry County Kitchen OS Audit Milestone

This milestone tracks every finding from `App Audit Request.pdf` and the work needed to move the audit from "Not Ready" to complete coverage.

Status legend:

- Done: implemented and verified in this branch.
- Partial: some coverage exists, but more work is needed.
- Todo: not yet implemented.

## Milestone 1 - Demo Blockers

| Status | Area | Audit Finding | Completion Criteria |
| --- | --- | --- | --- |
| Done | Recipe scaling | Gram values rounded incorrectly, e.g. 187.5g dark chocolate became 190g. | Scaling keeps one decimal for weights/volumes and rounds count units up only where sensible. Tests cover 0.75x brownie scaling. |
| Done | Dynamic costing | Costing used static values unrelated to the selected recipe. | Costing recalculates when the recipe/yield/selling price changes and uses live ingredient costs. |
| Done | Inventory validation | Negative stock was accepted and edits could reset cost to zero. | UI/API reject negative stock, keep latest cost on edit, and require valid numeric fields. |
| Done | Stock adjustment | Ingredient detail used fixed quick actions (+100g/-1g) without reason or history. | Stock changes use a quantity/reason modal and write inventory movement records. |
| Done | Order production guardrails | Orders could be produced despite shortages and inventory could be deducted incorrectly. | Production completion checks stock, blocks invalid statuses, and deducts inventory once. |
| Done | Shopping list purchase | Marking purchased cleared items without inventory updates. | Selected purchases update inventory, log purchases, and keep unselected items. |
| Done | AI conversion prompts | AI conversion responses were static and used browser prompts. | Suggestions select ingredient-specific rules, editable values are in-app, and rules save through the API. |
| Done | Supplier prompt flow | Add Supplier used `prompt()` and could leave the SPA. | Supplier add/edit uses an in-app form with contact, address, currency, and notes. |
| Done | Search state | Search terms persisted when switching modules. | Navigation clears the shared search query. |

## Milestone 2 - MVP Reliability

| Status | Area | Audit Finding | Completion Criteria |
| --- | --- | --- | --- |
| Done | Shopping list | Shortage calculations need broader real-order coverage and editable purchase cost. | Shopping list aggregates active demand, low-stock top-ups, editable quantities/prices, supplier assignment, and purchase notes. |
| Done | Order reservation | Reservation is all-or-nothing. Audit requested partial reservation. | Operators can reserve available stock, see remaining shortages, and reserve the remainder after stock is purchased. |
| Done | Production module | Production page still needs deeper task workflow, though grouping is now available. | Orders are grouped by recipe/date, batch quantities are calculated, and grouped batches can be reviewed, started, and completed with inventory guardrails. |
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
| Done | Performance | Audit found slow load, large bundle, and missing skeleton states. | Loading states use skeletons, empty/error states are graceful, the production bundle remains under 70KB gzip, and blocking prompt/modal flows were removed. |
| Done | Desktop density | Desktop views can feel stretched and sparse. | 1440px+ layouts use denser grids and constrained detail/form columns while preserving readable tables. |

## Milestone 4 - Product Completeness

| Status | Area | Audit Finding | Completion Criteria |
| --- | --- | --- | --- |
| Partial | Authentication | Login exists, but route protection/roles are not complete. | Private routes require auth, roles gate actions, and sessions are managed securely. |
| Todo | Notifications | Low stock/order reminders are missing. | Operators receive configurable notifications for low stock, due orders, and production status. |
| Todo | Exports | Recipe/order/shopping exports are incomplete. | Export PDF/CSV for recipes, shopping lists, inventory, and orders. |
| Todo | Multi-currency/tax | Only NGN is effectively supported. | Currency and tax settings apply consistently to costs, purchases, and order margins. |
| Todo | Analytics | Advanced dashboards are missing. | Sales trends, waste analysis, inventory velocity, and supplier performance are available. |

## Validation Checklist

- [x] Unit tests passed with `npm test`.
- [x] Production build passed with `npm run build`.
- [x] Browser smoke check passed against the local built server.
- [x] No `window.prompt()` usage remains in `src`, `api`, or `server`.
- [x] Browser smoke checked production batches, supplier catalog fields, settings fields, and costing tax display.
- [x] Browser smoke checked recovery archive loading and restore controls.
- [x] API smoke checked archive listing and audit-log writes.
- [x] Mobile/responsive controls verified through the responsive table/card implementation and browser smoke.
- [x] Keyboard/accessibility pass covered visible focus, table scopes, named controls, modal scrolling, loading state, and recovery actions.
- [ ] Re-run an external audit after Milestones 1-3 are complete.

## Next Recommended Work

1. Re-run the external audit now that Milestones 1-3 are complete.
2. Finish auth/roles and session hardening.
3. Add exports, notifications, multi-currency handling, and analytics from Milestone 4.
4. Expand audit reporting into searchable/filterable compliance views.
5. Add advanced FEFO reporting, waste analytics, and supplier performance dashboards.
