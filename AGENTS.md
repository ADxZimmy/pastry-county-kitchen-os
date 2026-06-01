# Repository Instructions

- After completing any local code or documentation change in this repository, commit the change and push it to GitHub before ending the turn, unless the user explicitly says not to.
- If future work starts in a new conversation, preserve this push-after-change workflow for this repository.
- Vercel Hobby deployments for this private repo can be blocked when commits are authored by an unrecognized identity. Use the repo owner GitHub identity for deployment-triggering commits: `ADxZimmy <84815694+ADxZimmy@users.noreply.github.com>`.
- For browser smoke tests and other app verification, use the live deployment at https://pastry-county-kitchen-os.vercel.app instead of local servers when local environment variables are unavailable.
- Use live test credentials from the local ignored `.env.local` file (`LIVE_TEST_EMAIL` and `LIVE_TEST_PASSWORD`). Do not commit plaintext passwords or secrets to the repository.
