# UAT

## Scenario

Create past/today/tomorrow/this-week/future and terminal-status orders, validate queue membership, attempt invalid direct transitions, complete one reviewed batch twice concurrently, and test cancellation before and after deduction.

## Result

Not run; plan-only.

## Notes

Exactly one completion/deduction may commit. Normal cancellation after deduction must be blocked or routed to an explicit correction workflow.
