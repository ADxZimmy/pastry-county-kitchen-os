# Email Certification Gate

Provider: Resend.

## Automated Checks

- Low-stock email code path logs safely when no recipient is configured.
- Low-stock email code path logs safely when `RESEND_API_KEY` is missing.
- Low-stock email code path logs safely when `RESEND_FROM_EMAIL` is missing or still uses Resend's default onboarding sender.
- Configured notification action is role-protected.
- If `RESEND_FROM_EMAIL` is available, DNS lookup records SPF, DKIM-related TXT records, and DMARC policy evidence for the sending domain.

## Manual Sign-Off

- Confirm the sending domain is verified in Resend.
- Confirm SPF and DKIM pass for a controlled test message.
- Confirm DMARC alignment passes for the controlled test message.
- Confirm the low-stock alert reaches a controlled inbox and does not land in spam.
- Confirm bounce/complaint monitoring owner and process.

## Blocking Criteria

Unverified sending domain, missing SPF/DKIM/DMARC proof, uncontrolled external sends during testing, or failed controlled inbox delivery blocks 100/100.
