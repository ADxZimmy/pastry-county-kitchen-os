# Phase 006a — Production Deployment Record

Status: **COMPLETED — S0 production exit checks passed**
Completed: 2026-07-11
Owner action required: no

## Superseded Account Diagnosis

The earlier version of this file incorrectly treated `ADxZimmy` as the production Vercel account and described the active Vercel context as unable to reach production. Repository and Vercel metadata disproved that diagnosis:

- `ADxZimmy <84815694+ADxZimmy@users.noreply.github.com>` is the GitHub repository/commit identity required for deployment-triggering commits.
- Production is the long-standing Vercel project `prj_3HN5fBetOYebhRrcwjK1QzSr5kSy` under team `sanuske2-2147s-projects` (`team_SumcS7BfGXgJWdQc7y2iAxSk`).
- The existing local `.vercel/project.json` already referenced that project and team; no account relink or revert was needed.

The former blocked instructions and claims about an `ADxZimmy` Vercel project are superseded by this record.

## Secret Configuration

A cryptographically random 48-byte base64url value was generated locally and configured as the sensitive `SESSION_SECRET` variable in Vercel's Production scope. The value was passed without displaying it and is not stored in this file or the repository.

Changing the signing secret invalidates sessions signed with the former fallback, so users may need to sign in once again. This is expected.

## Deployment

- Deployment ID: `dpl_EHgWLn3YWvWRhwY7U9wYUWU5VSCi`
- Deployment URL: `https://pastry-county-kitchen-8wxnzyk2b-sanuske2-2147s-projects.vercel.app`
- Canonical alias: `https://pastry-county-kitchen-os.vercel.app`
- Result: Ready

## Production Evidence

1. `GET /api/health` returned HTTP 200 with Neon available and `sessionSecret: "configured"`.
2. Unauthenticated `POST /api/inventory-movements` returned HTTP 410.
3. Unauthenticated `POST /api/actions {"action":"schema.ensure"}` returned HTTP 401 before schema maintenance.
4. The first umbrella smoke attempt exposed a runner collision with the intentional five-login/60-second limit; Phase 4 was the sixth Owner/Admin login and correctly received 429.
5. The runner was updated to wait for that window to reset. `npm.cmd run smoke:live-audit` then passed every component suite against the canonical production alias.
6. Cleanup finished with zero temporary smoke users, active smoke ingredients, and FEFO overstatements.

These results clear the automated/live S0 exit checks and permit Phase 007 work. They do not approve an unscripted demo; the D1 gate and the remaining Phase 006a manual role-matrix UAT are still outstanding.

## Future Rotation / Recovery

Rotate `SESSION_SECRET` deliberately as a sensitive Production variable, redeploy, verify `/api/health`, and expect existing sessions to be invalidated. If the health check reports the secret missing, restore a valid dedicated secret and redeploy. Do not reintroduce the `DATABASE_URL` or development-secret fallback, and do not restore the unauthenticated inventory route.
