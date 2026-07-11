# Phase 006a — Deploy Approval Request

Status: **BLOCKED — awaiting owner approval + production secret**
Raised: 2026-07-11
Owner action required: yes (only the `ADxZimmy` Vercel account can complete step 1)

---

## 1. What is blocked

Phase 006a (Immediate Security Containment) is implemented, tested, and committed
locally but **not pushed**. It cannot deploy safely until a production secret is set.

Unpushed commits on `main` (ahead of `origin/main` by 2):

- `6b2ea8c` Implement phase 006a security containment
- `ca8b7af` Record phase 006a deploy hold and Vercel account boundary

Local verification already passed: `npm test` 94/94, `npm run build` clean,
`npm audit` 0 vulnerabilities, plus a runtime probe of the shipped handlers (7/7).

## 2. Why it is blocked

Phase 006a change RS-004 makes session signing **fail closed in production**: if
`SESSION_SECRET` is not configured, login / bootstrap / actions return HTTP 503.
This is intentional (it removes the insecure fallback to `DATABASE_URL` / a shared
dev constant), but it means the secret must exist **before** the new code goes live.

Deploy path is a git push to `main`, which the production Vercel project
auto-deploys.

## 3. Risk if done in the wrong order

If `main` is pushed **before** `SESSION_SECRET` exists on the production project,
the new build deploys without the secret and **every authenticated request returns
503 — a full outage** until the secret is added and a redeploy completes.

## 4. Account boundary (important)

The local Vercel CLI is authenticated as **`nnazimuzoo`**, which does **not** own the
production project. Production (`https://pastry-county-kitchen-os.vercel.app`) is
deployed from the **`ADxZimmy`** account (the GitHub repo owner). Therefore the
secret must be set on the **ADxZimmy** account — Claude cannot do this step.

(An empty stray `pastry-county-kitchen-os` project accidentally created under
`nnazimuzoo` during investigation has already been deleted; the local `.vercel`
link was removed.)

## 5. Pre-deploy step the owner must perform (on the ADxZimmy account)

1. Generate a strong secret locally (keeps it out of chat/logs):
   ```
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
   ```
2. Vercel dashboard (signed in as **ADxZimmy**) → project **pastry-county-kitchen-os**
   → **Settings → Environment Variables** → Add:
   - Key: `SESSION_SECRET`
   - Value: the generated string (min 16 chars)
   - Environment: **Production** (Preview/Development optional; not required)
   - Save.

## 6. Approval

Mark this section and tell Claude to proceed.

- [ ] I approve deploying Phase 006a (`6b2ea8c`, `ca8b7af`) to production.
- [ ] `SESSION_SECRET` is set on the **ADxZimmy** production project (Production scope).
- [ ] I accept the one-time side effect: all currently signed-in users are logged
      out once after deploy (old tokens were effectively signed with `DATABASE_URL`)
      and must sign in again.

Approved by: ______________________   Date: ____________

## 7. What Claude does after approval

1. `git push` (triggers the production auto-deploy).
2. Verify `GET /api/health` returns `sessionSecret: "configured"` (and `ok: true`).
3. Confirm unauthenticated `POST /api/inventory-movements` returns **410**.
4. Confirm unauthenticated `POST /api/actions {"action":"schema.ensure"}` returns
   **401** with no schema change.
5. Run `npm run smoke:live-audit` against production.
6. Record results in `VERIFICATION.md`; on green, this clears the **S0 Security
   Containment** gate and Phase 007 may begin.

## 8. Rollback

If `/api/health` reports `sessionSecret: "missing"` or auth returns 503 after deploy,
the secret is not present on the production project — add it and redeploy (Vercel
"Redeploy" on the latest deployment). If a different regression appears, revert the
push (`git revert 6b2ea8c`, or redeploy the previous Vercel build) and re-open this
phase; do not restore the unauthenticated route or the secret fallback.
