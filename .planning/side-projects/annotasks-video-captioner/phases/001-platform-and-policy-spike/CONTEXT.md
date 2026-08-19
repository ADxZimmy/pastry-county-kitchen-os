# Context

## Goal

Establish a safe, evidence-backed observation path for one AnnoTasks video task without changing any annotation state.

## Relevant Files And Sources

- Path: `.planning/side-projects/annotasks-video-captioner/PROJECT.md`
  Why it matters: Defines the plugin boundary, runtime layers, and safety constraints.

- Path: `.planning/side-projects/annotasks-video-captioner/REQUIREMENTS.md`
  Why it matters: Contains the acceptance criteria that the feasibility result must support.

- Future path: `C:/Users/User/plugins/annotasks-video-captioner/skills/annotasks-video-captioning/SKILL.md`
  Why it matters: Will become the coordinator only after the spike passes and implementation is authorized.

- Source: [Encord Videos & Image Sequences](https://docs.encord.com/platform-documentation/Annotate/annotate-label-editor/annotate-videos)
  Why it matters: Confirms current video playback, frame stepping, scrubbing, playback-speed, and editor-timeline concepts.

- Source: [Encord Editor Settings & Shortcuts](https://docs.encord.com/platform-documentation/Annotate/annotate-label-editor/annotate-label-editor-settings-shortcuts)
  Why it matters: Confirms shortcuts are configurable and exposes a discoverable shortcut menu; generic shortcut meanings cannot safely replace the project-specific AnnoTasks guide.

- Source: AnnoTasks Video Captioning Annotation Guidelines supplied by the user on 2026-08-19.
  Why it matters: Defines the high-level caption, segmentation, detailed-caption, idle-label, pre-caption selection, timing, and final-review rules.

## Decisions

- Decision: Use the user's existing Chrome session rather than a separate unauthenticated browser.
  Reason: The task depends on the user's signed-in state, and the Chrome-control contract supports visible interaction without reading credential stores.

- Decision: Make Phase 001 completely read-only.
  Reason: UI selectors, video access, shortcut mapping, and platform policy are not yet proven.

- Decision: Discover shortcuts from the current project before using them.
  Reason: The supplied guide assigns `C` and `G` to project-specific actions, while generic Encord documentation lists different range and drawing meanings in other modes.

- Decision: Prefer rendered-frame observation over downloading or resolving the protected media source.
  Reason: It minimizes access scope and keeps the authenticated video inside the user's browser session.

- Decision: Keep local real-video extraction as an optional, user-approved fallback.
  Reason: It can analyze a user-provided local tutorial file efficiently, but it should not be used to extract an authenticated platform asset or add a package dependency without a specific need and security review.

- Decision: Require explicit user confirmation before final submission in the MVP.
  Reason: Submission is an external state change and the supplied guidelines make human judgment the quality bar.

## Risks

- Risk: The current page uses a canvas, cross-origin frame, DRM, or blob-backed video that cannot be reliably inspected or sought.
  Mitigation: Test stable rendered screenshots and keyboard/frame navigation first; stop and record the limitation rather than extracting credentials or media URLs.

- Risk: A shortcut changes meaning based on focus or annotation mode.
  Mitigation: Record focus, active mode, and shortcut menu mapping; prefer accessible controls when a key is ambiguous.

- Risk: Screenshot cadence misses brief actions.
  Mitigation: Use coarse sampling only to find candidates, then refine each candidate with adjacent frames and normal-speed playback.

- Risk: The model infers intent or misidentifies a hand/object.
  Mitigation: Enforce visible-action wording, mark uncertainty, inspect neighboring frames, and keep unresolved captions for human review.

- Risk: Browser automation violates project policy.
  Mitigation: Keep Phase 001 read-only and make policy confirmation a hard entry gate for controlled writes.

- Risk: Temporary frames expose confidential task data.
  Mitigation: Store them only in a task-scoped temporary directory, never in the repository, and remove them after the dry-run report unless the user explicitly requests retention.
