# Device accounts — for testers, and for whoever hands them out

A device account is a Kitchen OS login whose kitchen data stays in the browser you
use it in. You get an empty workspace and fill it with your own recipes,
ingredients and orders. None of it is stored in the Pastry County database.

## What "private" means here, exactly

Worth being precise, because the honest version is narrower than "nothing ever
leaves your device".

**Your kitchen data is never stored on the server.** Recipes, ingredients,
suppliers, orders, production runs, stock movements and your settings live in this
browser only. The owner cannot see them. Neither can another tester.

**Two things still go through the server, because a browser cannot do them:**

- **Importing a document.** When you import a recipe from a PDF, Word or Excel
  file, the file is sent to the server to be read, and the text is parsed there.
  For scanned images and older `.xls`/`.doc` files it is also sent to an external
  AI provider. The result comes back to your browser and is saved there — nothing
  from the import is kept in the database. If a file is sensitive, type or paste
  the recipe in instead; that is parsed on your own machine.
- **Low-stock email alerts.** Sending mail needs a mail provider. When you send an
  alert, the ingredient names in it go through that provider, and the email is
  sent only to your own address.

**Your account itself is central.** Your name, email and password hash are in the
Pastry County database, like any other account. The owner can see that your
account exists and can disable it. They cannot see what is in your kitchen.

**Your data is not encrypted on your device.** Anyone with access to your computer
and your browser profile can read it. Treat it the way you would treat a notebook
left on the counter.

## Back up, or you will lose it

This is the part that catches people out.

- **Clearing your browser data deletes your kitchen.** So does "clear cookies and
  site data" for this site, and some privacy cleaners do it on a schedule.
- **Another device is another kitchen.** Signing in on your phone does not show
  your laptop's work. It starts a second, empty workspace.
- **The browser may evict the data** if the device runs very low on space. The app
  asks for permanent storage and tells you in Settings whether the browser agreed.

**Settings → Device Data → Download backup** writes a single file with everything
in it. Keep it somewhere that is not this browser. **Restore backup** on the same
page loads it back, on this device or another one.

Restoring **replaces** the workspace — it does not merge. If you have two devices
with different work on them, restoring one onto the other loses whatever was
there. That is deliberate: guessing how to merge two versions of your stock would
be worse than telling you plainly.

The dashboard nags you about this until you have exported once, then stops.

## What is different from a normal account

- **No staff management.** Accounts are handed out centrally, so Settings shows
  your own account and nothing else. Ask the owner if you need another one.
- **Password reset gets your account back, not your data.** Your kitchen is on the
  device, not in the account.
- **Everything else works the same.** Recipes, scaling, stock, holds, production,
  costing, the shopping list, conversions, the Kitchen Helper, archive and
  restore, the audit trail — all of it runs in your browser against your data.

---

## For the owner

### Opening signup

Set **`SIGNUP_INVITE_CODE`** in the Vercel project's Production environment, then
redeploy — serverless functions read it at runtime, but the change needs a new
deployment to reach them.

Until it is set, `POST /api/auth/signup` returns 503 with "Signup is not open on
this deployment". That check depends only on server configuration, so a closed
deployment gives nothing away.

Testers go to the app, choose to create an account, and enter the code you give
them. Every account they create appears on your Staff page.

### Closing it again

Remove `SIGNUP_INVITE_CODE` and redeploy. Existing accounts keep working; no new
ones can be created. Rotate the code the same way if it gets shared further than
you intended.

### Shutting one account out

`user.disable` on the Staff page. It revokes every session immediately, so the
tester is locked out of signing in and of the two server-backed actions. **It does
not delete their local data** — that is on their device, and only they can clear
it.

### What a tester costs you

Device accounts can still call document import and low-stock email, which use the
AI provider and mail provider quotas. Invite-gating and the disable switch are the
brakes; there is no per-account spend limit on those two actions today.

### Proving the guarantee

```bash
npm run smoke:device-account
```

Needs `SIGNUP_INVITE_CODE` and a database credential. It creates a real account
against production, checks that it is refused every business read and write,
checks that the two allowed actions still work and reach only the tester, then
checks the database directly for anything the account left behind — and cleans up
after itself. It exits non-zero if either credential is missing rather than
skipping, because a privacy check that quietly reports green is worse than none.
