# Manual Certification Sign-Off Runbook

Use `docs/certification/manual-signoff.template.json` as the evidence format. Copy it to an ignored/local evidence file, fill each gate, and keep screenshots or exported logs alongside the final certification packet.

## Security

- Rate limiting / upstream abuse protection: attach Vercel Firewall, WAF, or gateway configuration showing login/API abuse protection. The in-app limiter is already automated, but upstream protection still needs operator proof.
- Secret storage: confirm `DATABASE_URL`, `SESSION_SECRET`, `RESEND_API_KEY`, and deployment tokens live only in Vercel/environment storage. Do not paste secret values.
- Role matrix: owner/operator confirms that Owner/Admin, Inventory Manager, Baker, and Viewer permissions match real bakery duties.

## Accessibility

- Keyboard-only walkthrough: complete login, dashboard navigation, inventory adjustment, shopping review, production review, audit export, and logout without a mouse.
- Screen-reader walkthrough: use NVDA or VoiceOver to confirm headings, primary navigation, mobile cards, form errors, modal announcements, and destructive confirmations.

## Email

- DNS proof: set `CERTIFICATION_EMAIL_DOMAIN` and `CERTIFICATION_DKIM_SELECTOR`, then rerun the certification runner.
- Controlled inbox: send exactly one low-stock alert to a controlled inbox and save the full message headers showing SPF, DKIM, and DMARC pass/alignment.
- Bounce/complaint owner: name the person or channel responsible for Resend bounce/complaint follow-up.

## Operations

- Backup/restore drill: record backup source, restore target, timestamp, and validation query.
- Rollback drill: record Vercel deployment rollback steps or a completed rollback test.
- Alert routing: name the production alert owner/channel for runtime errors, failed health checks, email delivery failures, and database incidents.

## Completion Rule

Every gate must have `"status": "complete"` plus an evidence reference. Pending, assumed, or verbal-only gates do not support a 100/100 certification claim.
