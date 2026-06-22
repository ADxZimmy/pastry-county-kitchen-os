# Project

## Mission

Pastry County Kitchen OS is a bakery operations dashboard for inventory, recipes, production, shopping, costing, staff, audit logs, and conversion workflows. The immediate mission is to move the live app from "Demo Ready with Fixes" to a production-readiness candidate.

## Audience

Primary users are bakery owners, bakers, and inventory managers who need reliable stock, FEFO lots, production guardrails, purchase costing, and operational reporting on desktop and mobile.

## System Shape

- Frontend: React, Vite, TypeScript, lucide-react.
- API: Express-compatible Vercel API routes under `api/` plus local server under `server/`.
- Data: Neon Postgres via `@neondatabase/serverless`.
- Deployment target: Vercel live app at `https://pastry-county-kitchen-os.vercel.app`.
- Verification: Vitest unit/API tests plus Playwright smoke scripts in `scripts/`.

## Constraints

- Do not commit secrets, production credentials, or customer data.
- Use live deployment verification when local env vars are unavailable, reading credentials only from ignored `.env.local`.
- Production-readiness blockers must be verified against live behavior, not only local fixtures.
- Security fixes must cover both API routes and frontend token handling.

## Working Agreements

- Commit and push after completed local changes in this repo unless the user explicitly says not to.
- Keep GSD artifacts under `.planning/`.
- Use `npm.cmd` on Windows when PowerShell blocks the `npm.ps1` shim.
- Relevant checks before handoff: `npm.cmd test`, `npm.cmd run build`, `npm.cmd run smoke:live-audit` when live credentials are available, plus targeted unauth/auth API checks for security changes.
