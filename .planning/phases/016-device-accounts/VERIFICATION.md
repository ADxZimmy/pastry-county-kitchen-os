# Verification

Phase 016 gives testers their own accounts and their own empty kitchens, with the
data kept on their device rather than in this database. Login stays central: the
owner sees every signup on the Staff page and `user.disable` locks an account out
immediately.

## The trust boundary

Device accounts hold `Owner/Admin`, because the app's existing permission gating
has to work inside their own workspace. That means **every role check passes for
them and `app_users.data_mode` is the only fence**, which is why the guard is
treated as security-critical rather than as a feature flag.

It sits at the two chokepoints every business path already flows through:

| Chokepoint | Covers |
|---|---|
| `requirePermission` (`api/_actions.js`) | all 31 actions, and `produceOrder` — so `api/orders/[orderId]/produced.js` is covered without its own check |
| `requireActiveSession` (`api/_auth.js`) | `/api/bootstrap` and all five `/api/data/*` resources |

The second lives **inside** `requireActiveSession` rather than in its two callers,
so the Express dev mirror and any future caller inherit it instead of having to
remember it.

Both refuse twice. Once on the actor before any query, which keeps the
authorize-before-database ordering `api/security-containment.test.js` pins; then
again on the stored row, because an actor built from a bearer token carries no
data mode and trusting the actor alone would leave that path open.

## The two actions that stay on the server

Both need something a browser cannot do, and both needed a device branch to stop
tenant data crossing:

- **`import.extract`** parses PDF/DOCX/XLSX with Node libraries. It normally reads
  the bakery's ingredient, recipe and supplier names as matching context — which
  would hand that list to a tester. A device caller sends its own names instead
  (capped at 500 entries of 120 characters), and the path queries no business
  table at all.
- **`notification.lowStockEmail`** sends through the mail provider. It normally
  derives recipients from the bakery's active staff, which would mail the wrong
  people about stock they do not hold. A device alert goes to the one address
  proven by signing in, and writes no `notification_events` or audit row.

`import.commit` is **not** on the allow-list: the server variant writes to
Postgres, so the draft is committed locally instead.

## Signup

Invite-gated (`SIGNUP_INVITE_CODE`), no email verification — mail delivery from
this app is still unproven, so a verification step would lock testers out rather
than protect anything.

- Unset invite code ⇒ **503** before anything else, depending on server
  configuration alone, so a closed deployment reveals nothing beyond being closed.
- The code is compared by hashing both sides to a fixed width, so neither its
  length nor its content leaks through an early return.
- Throttled 5 per 15 minutes, keyed per IP with a **constant identity**. Keying on
  the submitted email would have handed an attacker a fresh bucket for every
  address they invented.
- Email is lowercased before storage. The unique index on `app_users.email` is
  case-sensitive while login matches case-insensitively with `limit 1`, so two
  rows differing only by case would break sign-in.

**Enumeration posture, stated rather than assumed.** A duplicate address is
answered plainly, unlike password reset's deliberately vague response. Only an
invite holder can probe at all, and the owner sees every account that gets
created, so telling an invited tester they already have an account is worth more
than hiding it from an attacker who would first need the code.

**Signup refuses with 503 rather than inserting without the `data_mode` column.**
That is what makes every "missing column means server mode" fallback safe rather
than merely tolerable: no device account can exist before the column does, so the
default is provably correct. Inserting without it would have created a
server-mode Owner/Admin — the worst possible outcome of a missed migration.

## The local engine

`src/local/engine.ts` is pure: a workspace goes in, a result and a set of changed
collections come out. No IndexedDB, no network. That is what lets the arithmetic
be tested with plain objects, and what lets the store write every changed
collection in one transaction with a rejected action leaving nothing behind.

Rules shared with the server are **imported** from `shared/`, not re-implemented —
`shared/engine-parity.test.js` pins that by reference identity, so re-implementing
one and dropping the re-export fails a test rather than drifting quietly.

**The trap that was avoided.** `src/lib/kitchen.ts` already computes recipe
requirements, and reusing it would have been the obvious shortcut. It applies
display rounding — whole eggs, `ceil` for pcs, one decimal for measured units —
before summing, which is right for a preview and wrong for a deduction. The
server rounds nothing. The engine ports the server's formula; kitchen.ts stays
the preview it always was.

Idempotency is a storage constraint, exactly as on the server. A production claim
is written with IndexedDB `add()` on a store keyed by `orderId`, so a repeat or
concurrent completion raises `ConstraintError` and aborts the whole transaction
with no stock moved — what `unique (order_id)` on `production_runs` does in
Postgres.

## Evidence

| Check | Result |
|---|---|
| `npm test` | **519 passed across 16 files** (401 before this phase) |
| `shared/engine-parity.test.js` | 85 checks: reference identity for 18 rules, plus 62 fixture scenarios |
| `api/device-mode.test.js` | 45 checks, incl. a source-derived sweep of every blocked action |
| `api/_signup.test.js` | 20 checks |
| `src/local/engine.test.ts` | 38 checks |
| `src/local/db.test.ts` | 11 checks |
| `npx tsc --noEmit` | clean |
| `npm run perf:budget` | entry JS **100.5 kB / 150 kB**; engine present in a lazy chunk, absent from entry; 12/12 serverless functions |
| `npm run smoke:auth-cookie` (production, post-migration) | 35/35 |
| `npm run smoke:device-account` (production) | **32/32 — run `DEVICE-SMOKE-1786989835921-up6mbf`** |

### The privacy proof, run against production 2026-08-17

A real device account was created through the live signup endpoint and then, while
holding `Owner/Admin`:

- refused `/api/bootstrap`, all five `/api/data/*` resources, and `ingredient.save`,
  `settings.save`, `order.save` and `schema.ensure` — all 403;
- allowed `import.extract` and `notification.lowStockEmail`, with the alert's
  recipient list containing **only the tester's own address**;
- left **zero** rows in `inventory_movements`, `order_events`, `notification_events`,
  `orders`, `ingredients` and `recipes`;
- left exactly one `audit_logs` row, its own `signup` — the deliberate exception,
  so the owner can see who let themselves in;
- was locked out immediately (401) by `user.disable`, proving the central kill
  switch reaches a device account;
- cleaned up to `{"accounts":0,"sessions":0,"auditRows":0}`.

A wrong invite code was refused 403 and a duplicate email 409 in the same run.
| `npm run smoke:device-account` (production) | **32/32 — run `DEVICE-SMOKE-1786983888749-g8mytw`** |
| `npm run smoke:uat-full` (production, after the phase) | **9/9** — the existing kitchen is undisturbed |

### The privacy proof, run against production 2026-08-17

A real device account was created through the live signup endpoint and then, while
holding `Owner/Admin`:

- refused `/api/bootstrap`, all five `/api/data/*` resources, and `ingredient.save`,
  `settings.save`, `order.save` and `schema.ensure` — all 403;
- allowed `import.extract` and `notification.lowStockEmail`, with the alert's
  recipient list containing **only the tester's own address**;
- left **zero** rows in `inventory_movements`, `order_events`, `notification_events`,
  `orders`, `ingredients` and `recipes`;
- left exactly one `audit_logs` row, its own `signup` — the deliberate exception,
  so the owner can see who let themselves in;
- was locked out immediately (401) by `user.disable`, proving the central kill
  switch reaches a device account;
- cleaned up to `{"accounts":0,"sessions":0,"auditRows":0}`.

A wrong invite code was refused 403 and a duplicate email 409 in the same run.

### Checks that were proven to bite

A green check that cannot fail is the failure mode this programme has hit three
times, so two new guards were tested by breaking the thing they watch:

- The FEFO ordering assertion was run against a **reversed comparator** and failed
  on the exact lot quantities it asserts.
- The serverless function-count guard was run against a **limit of 11** and failed
  with the consolidation advice it is meant to give.

### Defects these tests caught

- **`runTransaction` was swallowing `ConstraintError`** inside a generic wrapper.
  The store recognises a lost production race by `name === "ConstraintError"`, so
  a second completion would have surfaced as an unexplained failure instead of
  "already produced". The request-level error is now preserved deliberately.
- **`api/_actions.js` kept a local `isMissingColumn` while also importing the
  shared one.** vitest's transform accepted it; plain Node refused the module
  outright, which would have been a 500 on every route. Module loading is now
  checked directly rather than inferred from a green suite.

## Bundle cost to everyone else

The engine is reached only through dynamic `import()`, so it lands in a 13.9 kB
gzipped lazy chunk. The entry bundle went **97.9 kB → 100.5 kB**: a server account
pays 2.6 kB for a feature it never uses.

`scripts/check-bundle-budget.mjs` enforces that placement, and requires the marker
to be **present** in a lazy chunk as well as absent from the entry one — an
absence check alone would pass by finding nothing anywhere, which is the
`tr[onclick]` mistake in a new costume.

## Deploy

| Step | State |
|---|---|
| Code deployed | Done. `POST /api/auth/signup` returns 503 with the unavailable message, `GET` returns 405, and the deployed bundle hash matches the local build. |
| Serverless function count | **12 of 12.** At the ceiling. The next endpoint must consolidate `api/auth/*` into one `api/auth/[op].js` dispatcher; CI now fails at 13 rather than letting a production build fail. |
| Migration `007-app-users-data-mode` | Applied 2026-08-17. Column present, default `'server'`, all 89 existing accounts read as server mode — no behaviour change for anyone. |
| `SIGNUP_INVITE_CODE` | **Set by the owner 2026-08-17.** Signup is open to invite holders. Remove the variable and redeploy to close it again. |

GitHub stopped recording deployment entries after `8619582`, so the deploy was
confirmed by probing the endpoints and comparing the served bundle hash rather
than by a deployment status. Worth knowing the next time a deploy appears not to
have happened.

## The gap the gates did not catch

Every server check, every engine test and the 32/32 production privacy smoke
passed while **the feature was unusable**: there was no signup screen and no link
to one, so nothing in the app ever reached the endpoint those tests were proving.
The owner found it by opening the site.

Worth recording plainly, because the gates were not wrong — they were aimed at the
wrong thing. Every suite here drives the API or the engine directly. Nothing drives
the signed-out UI, and the browser smoke family authenticates by seeding a cookie,
so it never renders a login screen either. A feature can therefore be completely
proven at the layer below the one a user touches.

The fix needed two changes, and the second is the one that would have wasted an
afternoon: the `signup` route had to be added to the **signed-out render
allow-list**. Without it an unauthenticated visitor fell through to the `!user`
branch and got the login form, so the first attempt changed the URL and rendered
nothing new — the route worked and the screen did not.

Verified in a real browser rather than inferred: navigation in both directions
between login and signup, both client-side validations (short password, mismatched
confirmation) refusing before any request, and a 375px viewport with no horizontal
overflow and no touch target under 44px.

## Not claimed

- **No multi-device sync.** Signing in on a second device starts a separate empty
  workspace. The backup file is the only bridge, and it is a manual one.
- **IndexedDB is evictable.** `navigator.storage.persist()` is requested and the
  answer is reported honestly in Settings, but a browser can still clear the data.
  The backup is the durability story; a dashboard banner says so until a tester
  has exported once.
- **A password reset restores access, never data.** The kitchen lives on the
  device, not in the account.
- **`fake-indexeddb` is not a browser.** The storage tests prove transaction
  semantics against a faithful implementation, not against Safari.
- **The emptiness proof rests on two legs, not one.** Rows that carry an actor —
  `audit_logs`, `inventory_movements`, `order_events`, `notification_events` — are
  checked directly. Tables with no attribution column cannot be delta-checked on a
  live production database, so for those the evidence is the 403s plus the
  server-side unit tests that show the device branches touch no business table.
- **No manual screen-reader pass** on the new signup and device-settings screens.
  The automated a11y sweep covers the existing routes.
