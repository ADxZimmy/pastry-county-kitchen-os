# Pastry County Kitchen OS Certification Dossier

Last updated: 2026-06-22  
Target: https://pastry-county-kitchen-os.vercel.app  
Release gate: 100/100 certification evidence pack

## Standards

- Security: OWASP Application Security Verification Standard 5.0.0, Level 1-style product readiness coverage.
- Accessibility: WCAG 2.2 AA, with automated Axe checks plus manual keyboard and screen-reader confirmation.
- Performance: Core Web Vitals release thresholds, including LCP <= 2.5s, INP <= 200ms, CLS <= 0.1, plus route/API timing evidence.
- Email: Resend verified domain evidence for SPF/DKIM and DMARC alignment, plus a controlled low-stock alert delivery proof.
- Operations: health checks, monitoring, backup/restore, rollback, environment-variable inventory, and incident response readiness.

## Certification Rule

The app can be marked 100/100 only when every domain below is either automatically proven by the certification runner or manually signed off with linked evidence.

| Domain | Automated evidence | Human/operator evidence |
| --- | --- | --- |
| Security | Auth/session/role probes, unauthenticated API checks, dependency audit, security headers, secrets scan | Threat-model review and confirmation that rate limits/production secrets are configured outside the repo |
| Accessibility | Axe, mobile overflow/touch target checks, focus/skip-link checks | Keyboard-only task pass and NVDA/VoiceOver notes |
| Performance | Route timing, resource counts, interaction latency, API health timing, bundle sizes | Load/concurrency acceptance if expected production usage changes |
| Email | Code guards and DNS record lookup for configured sending domain | Resend domain verified status and controlled inbox delivery |
| Operations | Health endpoint, cleanup checks, docs/runbook presence | Backup/restore drill, rollback drill, alert routing owner |

## Evidence Layout

The certification runner writes timestamped evidence under:

`work/certification-evidence-<timestamp>`

Each run should be zipped into:

`outputs/pastry-county-kitchen-os-certification-evidence-<date>.zip`

The final report should be saved as:

`outputs/pastry-county-kitchen-os-certification-report-<date>.md`

## Current Local Hardening Added

- `vercel.json` now defines CSP, frame protection, MIME sniffing protection, Referrer-Policy, and Permissions-Policy headers.
- The authenticated shell now has a keyboard-visible "Skip to main content" link.
- The app shell no longer depends on Google Fonts, which keeps production inside the stricter CSP and removes an external render-blocking font request from certification runs.

These changes must be deployed before the production certification runner can mark the live header and skip-link gates fully proven.
