# Accessibility Certification Gate

Standard: WCAG 2.2 AA.

## Automated Checks

- Axe scans for dashboard, inventory, shopping, production, settings, and AI on desktop and mobile.
- No horizontal overflow at 320, 360, 390, 414, and 430px on key routes.
- No interactive target smaller than 44x44px on mobile audit routes.
- Keyboard focus indicator is visible.
- The first keyboard focus can reach "Skip to main content".
- Activating the skip link moves focus to the main content region.
- Modals trap focus, keep background inert, close on Escape, and return focus to the trigger.
- Forms expose labels and visible validation messages.

## Manual Sign-Off

- Keyboard-only task pass: login, navigate dashboard, adjust inventory, purchase shopping item, review production, export audit report, logout.
- Screen-reader pass with NVDA or VoiceOver for route headings, mobile bottom navigation, table-card equivalents, form validation, and modal announcements.
- Color/contrast review for text, focus states, badges, destructive actions, and disabled states.

## Blocking Criteria

Any WCAG AA failure affecting core task completion, hidden focus, keyboard trap, missing control name, destructive action ambiguity, or mobile overflow blocks 100/100.
