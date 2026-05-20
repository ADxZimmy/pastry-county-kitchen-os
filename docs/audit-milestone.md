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
| Partial | Shopping list | Shortage calculations need broader real-order coverage and editable purchase cost. | Shopping list aggregates all active demand, low-stock top-ups, editable quantities/prices, supplier assignment, and purchase notes. |
| Partial | Order reservation | Reservation is all-or-nothing. Audit requested partial reservation. | Operators can reserve available stock, see remaining shortages, and release/adjust partial reservations. |
| Partial | Production module | Production page still needs deeper batching and schedule logic. | Orders are grouped by recipe/date, batch quantities are calculated, and production tasks progress independently. |
| Partial | Supplier management | Supplier CRUD exists, but supply catalogs and lead times are missing. | Suppliers can be linked to supplied ingredients, lead time, currency, and preferred ordering details. |
| Partial | Settings | Settings page exists for core preferences, but more settings are needed. | Business profile, currency/unit preferences, rounding, deduction timing, AI confirmation, and tax defaults all persist and affect app behavior. |
| Partial | Conversion library reuse | Conversion rules save, but recipe-builder reuse is incomplete. | Recipe entry can apply saved conversion rules while adding or parsing ingredients. |
| Partial | Stock/audit logs | Inventory movements exist, but broad audit history is incomplete. | Create/update/delete and order status changes are logged with actor, timestamp, and before/after data. |
| Todo | Expiry and batch tracking | Expiry dates and batch tracking are missing or shallow. | Ingredients can track batches, expiry dates, and FEFO usage guidance. |
| Todo | Delete undo | Some destructive actions confirm, but undo is not universal. | Destructive mutations have confirmation, archive where possible, and undo/recovery paths. |

## Milestone 3 - UX, Mobile, Accessibility, Performance

| Status | Area | Audit Finding | Completion Criteria |
| --- | --- | --- | --- |
| Partial | Responsive tables | Tables convert to cards, but mobile layout needs a full QA pass. | Inventory, orders, shopping, conversions, and forms are comfortable at 360x800 with no clipping or overlap. |
| Partial | Accessibility | Labels/focus exist in many places, but audit requested full WCAG pass. | All controls have accessible names, visible focus, sufficient contrast, and verified keyboard order. |
| Todo | Modal mobile behavior | Some modals/forms may still overflow on small screens. | All modals fit mobile viewports and allow Save/Cancel access with keyboard open. |
| Todo | Performance | Audit found slow load, large bundle, and missing skeleton states. | Route-level code splitting, skeleton/loading states, graceful API errors, Lighthouse pass, and no blocking font/image failures. |
| Todo | Desktop density | Desktop views can feel stretched and sparse. | Dense but readable layouts for 1440px and 1920px screens, with sorting/pagination where needed. |

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
- [ ] Run Lighthouse after performance work.
- [ ] Run a full mobile QA pass at 360x800 and 390x844.
- [ ] Run keyboard-only QA across inventory, orders, recipes, shopping, suppliers, settings, and AI conversions.
- [ ] Re-run an external audit after Milestones 1-3 are complete.

## Next Recommended Work

1. Finish partial reservation and richer shopping-list purchasing.
2. Complete production batching and scheduling.
3. Run a full mobile/accessibility pass.
4. Add route-level code splitting, loading states, and Lighthouse-driven performance fixes.
5. Finish auth/roles and broader audit logging.
