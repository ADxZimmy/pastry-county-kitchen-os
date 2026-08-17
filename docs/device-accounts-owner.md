# Device accounts — owner notes

Operational notes for running the tester programme. The tester-facing document is
`docs/device-accounts.md`; hand them that one, not this.

## What a device account is

A normal Kitchen OS login whose **kitchen data lives in the tester's browser
rather than in the database**. The account is central — it appears on your Staff
page and `user.disable` locks it out — but recipes, ingredients, orders,
production and stock never reach Postgres.

They hold the `Owner/Admin` role so the app's permission gating works inside their
own workspace. The fence that stops them reaching the bakery's data is the
`app_users.data_mode` column, not their role.

## Opening signup

1. Set **`SIGNUP_INVITE_CODE`** in the Vercel project's Production environment.
2. **Redeploy.** Serverless functions read the variable at runtime, but the change
   does not reach them until a new deployment.

Until it is set, the signup endpoint returns 503 and the signup screen reports
that signup is closed. That check reads only server configuration, so a closed
deployment gives nothing away about who has an account.

Testers reach signup from the link under the login button, or directly at
`.../#signup`.

## Closing it, or rotating the code

Remove or change `SIGNUP_INVITE_CODE` and redeploy. Existing accounts keep
working; the old code stops creating new ones. Rotate it if the code spreads
further than you intended — there is no per-code usage limit.

## Shutting one account out

**Staff page → Disable.** Sessions are revoked immediately, so the tester is
locked out of signing in and of the two server-backed actions.

It does **not** delete their local data. That is on their device, and only they
can clear it.

## What a tester costs you

Device accounts can still call two server actions, because a browser cannot do
either:

| Action | What it uses |
|---|---|
| Document import | The AI provider quota, for scanned images and older `.xls`/`.doc` files |
| Low-stock email | The mail provider quota; the email goes only to the tester |

Neither writes anything to the database. There is no per-account spend cap on them
today — the invite code and the disable switch are the brakes.

## Proving the privacy guarantee

```bash
npm run smoke:device-account
```

Needs `SIGNUP_INVITE_CODE` and a database credential. It creates a real account
against production, confirms the server refuses it every business read and write,
confirms the two allowed actions still work and reach only the tester, then
queries the database directly for anything the account left behind — and cleans up
after itself.

It exits non-zero if either credential is missing rather than skipping, because a
privacy check that quietly reports green is worse than none.

Last run: **32/32 passed**, 2026-08-17, run `DEVICE-SMOKE-1786983888749-g8mytw`.

It is also the tenth gate in `npm run smoke:uat-full`.

## Things worth knowing

- **The deployment is at 12 of 12 serverless functions.** Adding another endpoint
  requires collapsing `api/auth/*` into a single `api/auth/[op].js` dispatcher
  first. CI fails at 13 rather than letting a production build fail, since a
  failed Vercel build leaves the previous deployment serving and reads like a
  routing bug.
- **Migration `007-app-users-data-mode` must be applied** before signup will work.
  It is, as of 2026-08-17. Signup refuses with 503 rather than creating an account
  without the column, so a missed migration cannot silently produce a server-mode
  account with full access.
- **A duplicate email gets a plain "already has an account" response**, unlike
  password reset's deliberately vague wording. That is a considered trade-off:
  only someone holding the invite code can probe at all, and you see every signup
  on the Staff page.
- **Testers cannot sync between devices.** The backup file is the only bridge, and
  it is manual. Expect at least one tester to lose work before they make one — the
  dashboard nags them until they do.

Full engineering detail and the eight things deliberately not claimed are in
`.planning/phases/016-device-accounts/VERIFICATION.md`.
