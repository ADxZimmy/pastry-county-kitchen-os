# Project

## Mission

Create a personal Codex plugin named `annotasks-video-captioner` that can observe the current AnnoTasks video in the user's authenticated Chrome session, draft the required high-level caption, propose continuous action segments, help choose or correct Encord's generated detailed captions, and run a final quality review.

The plugin should prepare a task accurately and efficiently while leaving final submission under explicit user control by default.

This is a planning-only side project. No plugin, browser automation, marketplace entry, package, or runtime integration has been created.

## Audience

The primary user is an AnnoTasks video-captioning annotator who needs to complete short real-world task videos with at least 80% accuracy and a target pace of roughly five to seven minutes per one-minute video.

## System Shape

Planned destination:

```text
C:/Users/User/plugins/annotasks-video-captioner/
  .codex-plugin/plugin.json
  skills/
    annotasks-video-captioning/
      SKILL.md
      references/
        annotation-guidelines.md
        caption-policy.md
        browser-preflight.md
  scripts/
    validate-annotation.mjs
  assets/
```

Planned runtime layers:

1. A Codex skill coordinates the four-stage AnnoTasks workflow.
2. The installed Chrome-control plugin works through the user's existing signed-in Chrome session and visible page state.
3. A video-observation layer samples visible frames and refines action boundaries without reading browser cookies, password stores, or local storage.
4. A caption-policy layer converts the supplied AnnoTasks guidelines into deterministic checks.
5. A timeline validator rejects gaps, overlaps, invalid boundaries, and incomplete captions before any submission is offered.
6. A controlled writer applies approved drafts to the page. Submission remains a separate confirmation gate.

The MVP is intentionally skill-first. It does not include `.mcp.json` or `.app.json` unless the feasibility spike proves that the installed Chrome controller cannot provide reliable video/timeline interaction. Local video extraction is an optional fallback, not a default dependency.

## Planned Plugin Contract

- Name: `annotasks-video-captioner`
- Initial version: `0.1.0`
- Display name: `AnnoTasks Video Captioner`
- Category: `Productivity`
- Capabilities: `Interactive`, `Write`
- Primary skill: `annotasks-video-captioning`
- Marketplace: personal, `AVAILABLE`, authentication `ON_INSTALL`
- Default prompts:
  - `Caption the current AnnoTasks video.`
  - `Review this task for gaps and overlaps.`
  - `Fix these captions without submitting.`

Planned Phase 002 scaffold command, run from the Plugin Creator skill root only after implementation is authorized:

```powershell
python scripts/create_basic_plugin.py annotasks-video-captioner --with-skills --with-scripts --with-assets --with-marketplace
```

The manifest will declare `skills` immediately. It will declare `mcpServers`, `apps`, icons, logos, or screenshots only when the corresponding real files exist. It will not declare unsupported `hooks` metadata. The completed plugin must pass `scripts/validate_plugin.py` before installation or handoff.

## Constraints

- The AnnoTasks guidelines supplied on 2026-08-19 are the functional source of truth for caption style, sequencing, idle labels, and review.
- Encord shortcuts are configurable. The plugin must discover or confirm the current project's mapping instead of blindly replaying hard-coded keys. Official Encord documentation exposes the shortcut menu with `Ctrl + Shift + K` and documents generic range controls that differ from the supplied AnnoTasks guide: [Editor Settings & Shortcuts](https://docs.encord.com/platform-documentation/Annotate/annotate-label-editor/annotate-label-editor-settings-shortcuts).
- The browser session remains owned by the user. The plugin must not inspect cookies, saved passwords, session stores, or local storage.
- Do not bypass sign-in, CAPTCHA, rate limits, task assignment, review controls, or anti-automation measures.
- Confirm that assisted browser automation is permitted by the user's AnnoTasks agreement before enabling page writes.
- Treat each task video, extracted frame, generated caption, and task identifier as potentially confidential. Keep temporary captures local, avoid durable copies by default, and clean them after the task.
- No high-level caption may mention a hand, operator, worker, person, arm, or robotic arm.
- Detailed captions must describe visible actions only, identify each working hand, distinguish similar objects, and use simple present tense.
- Final submission is external and consequential. The default mode may fill or stage work, but it must not submit without explicit confirmation for the current task.
- This plugin is independent of Pastry County Kitchen OS. It must not import, modify, deploy, or depend on the bakery application's runtime.

## Working Agreements

- Use the Plugin Creator scaffold only after the user authorizes implementation.
- Default to a personal marketplace plugin at `C:/Users/User/plugins/annotasks-video-captioner` with its entry in `C:/Users/User/.agents/plugins/marketplace.json`.
- Planned marketplace policy: `installation: AVAILABLE`, `authentication: ON_INSTALL`, category `Productivity`.
- Inspect any new package or executable before installation. Do not add global hooks, shell startup changes, or hidden background processes.
- Start every platform integration with a read-only dry run against a tutorial or expendable task.
- Record actual verification in the active phase's `VERIFICATION.md`; do not convert planned checks into claimed evidence.
