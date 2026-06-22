# Plan

## Outcome

The app moves from the June 22 audit score of 72/100 to a production-readiness candidate by closing all Critical/High findings, closing the visible Medium findings, and proving the fixes with repeatable local and live checks.

## Scope

Included:

- Critical public bootstrap data exposure.
- Decimal shopping purchase failures and live schema drift.
- Flour/sugar/cocoa/egg/yolk/white/coconut-oil conversion correctness and AI parsing.
- Mobile shopping touch targets and duplicate accessibility controls.
- Production modal Escape/focus behavior.
- Unknown-route fallback.
- Dashboard stale "Today's Production" logic.
- Audit-log display-name search.
- User-safe API error messages.
- Verification gaps for repeated production deduction, manual stock adjustment, and live audit smoke.

Excluded:

- Full redesign of Settings or shopping desktop layout beyond audit blockers.
- Sending production low-stock emails to a real recipient.
- Introducing new frameworks or replacing the current API architecture.

## Steps

1. Step: Lock down bootstrap reads.
   - Reuse `actorFromRequest` or equivalent signed-session verification in `api/bootstrap.js` and `server/index.js`.
   - Update `loadKitchenData` in `src/App.tsx` to send `Authorization: Bearer <token>` for authenticated pages.
   - Keep `welcome` and `login` usable without bootstrap data; show session-expired/login messaging on 401.
   - Add tests asserting unauthenticated bootstrap cannot read private data and authenticated bootstrap still loads the snapshot.

2. Step: Fix decimal shopping purchases.
   - Inspect live schema drift for `purchase_logs.purchase_price`, `cost_per_base_unit`, and any API casts.
   - Add idempotent migration/alter checks so live columns are numeric with decimal scale.
   - Ensure `shopping.purchaseSuggested` stores `0.5`, `0.64`, `2.75`, and whole values without integer casts.
   - Replace raw database errors with user-safe validation messages.
   - Extend tests and live smoke to cover fractional purchase success, movement creation, FEFO lot creation, and latest-cost update.

3. Step: Repair conversions and AI parsing.
   - Seed or migrate Flour cup rule to `120g`, Sugar to `200g`, Cocoa to `85g`, Egg to `50g`, Yolk to `18g`, White to `30g`, Coconut Oil cup to `240ml`.
   - Dedupe active verified conversion rules by ingredient/from/to.
   - Improve `parseRecipeText` / AI prompt parsing for natural questions like "Convert 1 cup sugar to grams".
   - Add unit tests and live smoke assertions for every audit conversion prompt.

4. Step: Fix mobile shopping accessibility.
   - Increase checkbox/toggle hit areas to 44px+ while keeping visual density.
   - Ensure desktop table controls are not exposed to the accessibility tree when mobile cards are active, and mobile cards are not exposed when desktop table is active.
   - Add Playwright/axe assertions for no duplicate shopping labels and viewport checks at 320, 360, 390, 414, and 430 widths.

5. Step: Make modals keyboard-correct.
   - Add Escape close handling to shared modal surfaces.
   - Return focus to the triggering button and keep background inert while dialogs are open.
   - Cover Review Batch, View Scaled Recipe, Conversion edit/import, stock adjustment, and confirm dialogs.

6. Step: Clean routing and dashboard date behavior.
   - Route unknown hashes to dashboard or a not-found screen without stale content.
   - Change Today's Production to use the actual current date and split overdue/completed items from today.
   - Add date-fixture tests so June 22 does not show May orders as "today".

7. Step: Improve audit search and display names.
   - Enrich audit rows with display names from active/archived ingredients, recipes, orders, suppliers, conversion rules, and staff where possible.
   - Extend `auditSearchText` and CSV/export rows to include display name while preserving redaction.
   - Add tests for searching an `AUDIT-*` ingredient name after create/purchase/archive.

8. Step: Close verification gaps.
   - Add server/API tests for production repeated-deduction idempotency and manual negative stock adjustment FEFO behavior.
   - Update `scripts/live-audit-smoke.mjs` to include bootstrap auth, decimal purchase, conversion prompts, mobile/a11y checks, modal Escape, unknown route, dashboard date, and audit name search.
   - Run local tests/build and live smoke, then update `docs/audit-handoff.md`.

## Verification

- Check: `npm.cmd test`
  Expected: all unit/API tests pass, including new security, decimal purchase, conversion, routing, dashboard, audit, FEFO, and modal tests.

- Check: `npm.cmd run build`
  Expected: production build passes.

- Check: unauthenticated `GET https://pastry-county-kitchen-os.vercel.app/api/bootstrap`
  Expected: 401 with no private data.

- Check: authenticated live bootstrap smoke
  Expected: owner login loads dashboard and all core modules.

- Check: `npm.cmd run smoke:live-audit`
  Expected: passes against production and cleanup reports zero active temporary smoke data.

- Check: targeted mobile/a11y smoke
  Expected: shopping touch targets are 44px+, no duplicate exposed controls, and no horizontal overflow in Production/Shopping/AI at 320/360 widths.

## Rollback

Revert the recovery commit series if bootstrap auth breaks app loading or a migration causes live write failures. Keep data migrations idempotent and reversible where possible; for conversion dedupe, archive duplicates instead of deleting them so rules can be restored.
