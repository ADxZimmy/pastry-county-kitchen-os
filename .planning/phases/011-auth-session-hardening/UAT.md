# UAT

## Scenario

Login, inspect storage/cookie flags, attempt CSRF and cross-origin mutations, rotate/revoke/logout sessions, request reset for known/unknown emails, redeem once, replay, and verify old sessions fail.

## Result

Not run; plan-only.

## Notes

Responses for known/unknown reset requests must be indistinguishable and no raw session/reset token may be stored server-side.
