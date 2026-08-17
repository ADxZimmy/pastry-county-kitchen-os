# Working in this repo

## UI and UX work

**Load the `ui-ux-pro-max` skill before touching any UI.** New screens, new
components, styling, layout, colour, typography, interaction, copy that appears
on screen, or reviewing how something looks — all of it. This is a standing rule,
not a judgement call, and it applies even when the change looks small or is
driven by a backend feature.

When adding a screen to what already exists, **read the sibling screens first and
match them.** Do not reconstruct the pattern from memory. The auth screens
(`Login`, `SignupPage`, `ResetPassword` in `src/App.tsx`) share `auth-shell`,
`auth-card`, `BrandMark`, `Field`, `Button` and an icon on the primary action;
a new one that skips any of those looks visibly wrong next to them.

**Then open it in a browser.** A green test suite does not prove a screen exists
or that a control is reachable. Every suite here drives the API or the engine
directly, and the browser smokes authenticate by seeding a cookie, so none of
them render a signed-out screen. Check desktop and 375px.

A route needs registering in **two** places: `src/lib/routes.ts`, and the
signed-out render allow-list in `src/App.tsx` (`page === "welcome" || "login" ||
"reset" || "signup"`). Miss the second and the URL changes while the screen does
not.

## Evidence

This project records what it verified, not what it intended. Phase notes live in
`.planning/phases/*/VERIFICATION.md` and state what was checked, what the check
actually proved, and what is deliberately not claimed.

A check that cannot fail is worse than no check. This programme has shipped three
of them — a stale selector, a `tr[onclick]` test React could never match, and a
cleanup assertion that silently skipped without `DATABASE_URL`. When adding a
guard, break the thing it watches and confirm it goes red.

## Gates

```bash
npm test                     # unit, policy, permission, engine and storage suites
npm run build                # type check and production build
npm run perf:budget          # entry bundle, chunk placement, serverless function count
npm run smoke:uat-full       # the full production gate; needs live credentials
```

The deployment sits at **12 of 12 serverless functions**. The next endpoint must
consolidate `api/auth/*` into one dispatcher first; CI fails at 13 rather than
letting a production build fail silently.
