# UAT

## Scenario 1: Revoked Session Cannot Read Kitchen Data

User action and expected result:

Log in as a low-privilege test user, revoke that user's sessions from an Owner/Admin account, then retry `/api/bootstrap` with the old token. The app should return 401 and no kitchen snapshot.

## Result

Not run.

## Scenario 2: Fresh Login Opens Dashboard

User action and expected result:

Open the live app in a fresh browser context, log in with the configured live test account, and land on Dashboard without seeing `Session expired`.

## Result

Not run.

## Scenario 3: AI Conversion Prompts Use Verified Rules

User action and expected result:

Ask the AI chat the exact audit conversion prompts. It should return the verified rule quantities, including flour `480g`, sugar `200g`, cocoa `85g`, eggs `200g`, and coconut oil `240ml`.

## Result

Not run.

## Scenario 4: Production Mobile Accessibility

User action and expected result:

Open Production at 320px width. The page should not scroll horizontally, actions should remain tappable, headings should follow a valid order, and mobile cards should use valid list semantics.

## Result

Not run.
