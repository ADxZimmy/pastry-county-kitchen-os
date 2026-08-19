# Requirements

## Functional

- Requirement: Run a no-write browser preflight before each task.
  Acceptance: The plugin confirms the expected AnnoTasks/Encord host, one visible video player, duration, timeline, high-level caption field, detailed-caption controls, task state, and current shortcut mapping before pressing keys or typing.

- Requirement: Preview the whole video before segmenting it.
  Acceptance: The plugin observes the complete video at 8x when the UI supports that speed, or reports that the required speed is unavailable; it drafts the high-level caption before creating any segment.

- Requirement: Write a valid high-level caption.
  Acceptance: The draft is one or two natural-English sentences that state the overall task and goal without mentioning a hand, person, operator, worker, arm, or unnecessary machinery jargon.

- Requirement: Identify distinct observable actions.
  Acceptance: Candidate boundaries follow visible action changes, combine small actions that naturally belong together, and are refined to the closest defensible frame rather than being distributed at fixed intervals.

- Requirement: Cover the entire video exactly once.
  Acceptance: Segment 1 starts at the first frame, the last segment ends at the final frame, every adjacent pair shares one boundary, and a validator reports zero positive gaps and zero overlaps.

- Requirement: Treat the expected 10-12 segments as guidance, not a quota.
  Acceptance: The plugin may produce fewer or more segments when the visible actions require it and explains unusually coarse or fine segmentation during review.

- Requirement: Use Encord's pre-captioning options as drafts.
  Acceptance: For every segment, the plugin fetches the available generated options, compares all visible choices to the segment, selects the most accurate one, and edits only incorrect or missing details when a usable option exists.

- Requirement: Write valid detailed captions.
  Acceptance: Each action caption uses simple present tense, names only working hands, describes visible actions without intention or speculation, identifies the acted-on object, and distinguishes identical objects by position or visible feature.

- Requirement: Apply the correct non-action label.
  Acceptance: The plugin uses `NU` for no meaningful task/action, `DO` for off-task distraction, and `ID` for waiting/preparation with no interaction; it does not invent an action to avoid an idle label.

- Requirement: Reuse repeated captions.
  Acceptance: When an action truly repeats, the plugin searches the Label Bank and reuses an already-verified caption instead of introducing an unnecessary paraphrase.

- Requirement: Review before submission.
  Acceptance: The plugin replays or re-samples every final segment, displays a review report covering continuity and caption-policy checks, and stops for user confirmation before the platform's final submit action.

- Requirement: Recover safely from interruption or UI drift.
  Acceptance: If the current task, video element, timeline, shortcut mapping, or dirty state changes unexpectedly, the plugin stops writing, reports the last verified boundary, and resumes only after a new preflight.

## Non-Functional

- Requirement: Accuracy takes priority over speed.
  Acceptance: Automatic page filling remains disabled until a benchmark set reaches at least 80% on both boundary and caption review; any lower score keeps the plugin in draft-only mode.

- Requirement: Meet the target pace after qualification.
  Acceptance: On a representative benchmark, the median end-to-end preparation time for a one-minute video is seven minutes or less without lowering the 80% quality gate.

- Requirement: Keep page interaction deterministic.
  Acceptance: The plugin records the observed task state before and after each write, waits for the expected UI acknowledgement, and refuses to continue after an ambiguous or duplicated action.

- Requirement: Protect user credentials and task data.
  Acceptance: The implementation reads no cookie store, saved password, browser local storage, or unrelated tab; writes no secrets to logs or planning files; and deletes temporary captures after verification unless the user explicitly asks to retain them.

- Requirement: Tolerate platform configuration changes.
  Acceptance: Selectors and shortcuts are discovered from accessible roles, labels, and the visible shortcut menu where possible; a mismatch fails closed with a useful message.

- Requirement: Keep the plugin lightweight.
  Acceptance: The first shippable version contains a plugin manifest, one primary skill, focused reference files, and a deterministic annotation validator. A custom MCP server or browser extension is added only with evidence that the installed Chrome-control path is insufficient.

## Out Of Scope

- Automatically submitting completed tasks without per-task user confirmation.
- Bypassing authentication, CAPTCHA, rate limits, anti-bot controls, assignment rules, or quality review.
- Scraping unrelated tasks, worker analytics, payment data, or other annotators' work.
- Inferring hidden intentions, object identities, or actions that are not visible.
- Replacing Encord's pre-captioning service or modifying its generated model output at the source.
- Building a generic automation framework for every Encord ontology or annotation type.
- Bundling a custom MCP server, browser extension, hosted service, database, or remote telemetry in the MVP without a failed skill-only feasibility result.

## Open Questions

- Question: Which exact AnnoTasks host and Encord project configuration will be used?
  Status: Discover read-only in Phase 001; do not record credentials or private query parameters.

- Question: Does the user's AnnoTasks agreement permit browser-assisted annotation and automated field entry?
  Status: Must be confirmed before Phase 004 enables writes.

- Question: Can the installed Chrome controller reliably seek the current authenticated video and capture a stable rendered frame without extracting the protected media URL?
  Status: Phase 001 feasibility gate.

- Question: Are the supplied `C`, `G`, `1/2/3`, and `Ctrl + B` shortcuts stable in the target project?
  Status: Verify from the current UI on every preflight; never assume generic Encord defaults.

- Question: Should an explicitly requested future mode be allowed to submit after all checks pass?
  Status: Deferred. The planned MVP always requires the user to perform or confirm final submission.
