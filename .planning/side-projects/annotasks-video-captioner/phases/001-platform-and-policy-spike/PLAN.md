# Plan

## Outcome

A written feasibility report from one tutorial or expendable AnnoTasks task demonstrates whether the installed Chrome-control path can:

- identify the correct task and video controls;
- confirm the project-specific shortcuts;
- observe the entire video and stable individual frames;
- draft a policy-valid high-level caption;
- propose and refine continuous action segments; and
- do all of this without changing or submitting annotation data.

The report ends with one of three decisions: proceed with the skill-first architecture, proceed with a documented limitation and human step, or plan a narrow browser bridge.

## Scope

Included:

- A read-only policy and page-state preflight.
- Inspection of visible AnnoTasks/Encord controls and shortcut help.
- Playback, speed, scrub, frame-step, and screenshot feasibility.
- A local, temporary observation manifest for one video.
- Draft high-level caption and segment candidates.
- Caption-policy and timeline validation against the dry-run manifest.
- Cleanup of temporary captures.

Excluded:

- Scaffolding or installing the plugin.
- Installing video-analysis packages or browser extensions.
- Typing into AnnoTasks, creating ranges, fetching generated captions, choosing options, opening the Label Bank, saving, or submitting.
- Reading cookies, passwords, local storage, session stores, protected media URLs, or unrelated tabs.
- Benchmarking speed or claiming 80% quality from one video.

## Steps

1. Confirm the test surface.
   - Ask the user to open a tutorial or expendable task in their already signed-in Chrome session.
   - Confirm the task is safe for a read-only feasibility check.
   - Record only a redacted host, visible task state, and video duration; do not persist private query parameters or credentials.

2. Verify the active page contract.
   - Confirm one visible video player, timeline, high-level caption area, detailed-caption/range controls, generated-caption area, Label Bank control, save/submit state, and a visible task identifier or title.
   - Record initial annotation count, unsaved/dirty indicator, and submit availability so the final no-mutation check has a baseline.
   - Stop if the expected page or task state is not unambiguous.

3. Discover the shortcut contract.
   - Open the current Encord shortcut menu without activating an annotation tool.
   - Map preview-speed controls, frame navigation, range creation/backfill, generated-caption fetch, option selection, Label Bank, save, and submit.
   - Compare the visible mapping with the supplied `Shift + Up`, `Shift + Down`, `C`, `G`, `1/2/3`, `Ctrl + B`, and `Ctrl + Left/Right` guide.
   - Mark every mismatch as a runtime configuration, not a reason to force the supplied key.

4. Prove safe video observation.
   - Verify duration and first/last-frame navigation.
   - Verify that speed can be set to 8x and returned to 1x without changing annotation state.
   - Test stable rendered screenshots at known timestamps using visible playback/scrub controls.
   - If programmatic seeking is not safely available, test normal UI scrubbing and frame stepping.
   - If neither path is reliable, stop and record the exact limitation; do not resolve the video source or copy authenticated media.

5. Produce the dry preview.
   - Observe the complete video at the required preview speed.
   - Draft one or two simple sentences that describe the overall task and goal.
   - Run the high-level linter for banned actor/hand terms, length, and unnecessary technical jargon.

6. Generate candidate action boundaries.
   - Sample the video coarsely to locate visible action changes.
   - Revisit each candidate at 1x and step through neighboring frames to select the closest defensible boundary.
   - Combine small connected actions; do not force the result to 10-12 segments.
   - Emit a dry-run manifest with zero-based start/end times or frame indices and one draft caption per segment.

7. Validate the dry-run manifest.
   - Assert first-frame start, final-frame end, sorted boundaries, positive segment duration, and exact adjacency.
   - Flag gaps, overlaps, uncertain hand identity, vague objects, inferred intent, non-present tense, and idle periods lacking `NU`, `DO`, or `ID`.
   - Keep uncertain claims explicit; do not improve the score by guessing.

8. Human spot-check the evidence.
   - Ask the user to compare the high-level caption and at least the two lowest-confidence boundaries/captions with the visible video.
   - Record corrections as evidence for the future skill instructions.

9. Verify no mutation and clean up.
   - Compare annotation count, dirty indicator, and submit availability with the initial baseline.
   - Confirm no text, range, or selected caption was added.
   - Delete task-scoped temporary frames and the observation manifest unless the user explicitly asks to retain the redacted report.

10. Make the architecture decision.
    - Choose skill-first when the Chrome controller can reliably observe, seek, and verify state.
    - Choose skill-first plus a documented manual boundary when only one operation is unavailable.
    - Plan a narrow local MCP/browser bridge only when a required operation is consistently unavailable and no safe visible-control path exists.
    - Do not begin Phase 002 in the same turn without new user authorization.

## Verification

- Check: Shortcut mapping is read from the current project.
  Expected: Every planned key has a visible current meaning; conflicts are recorded and no ambiguous key is pressed.

- Check: Stable frame observation.
  Expected: Repeating a timestamp sample produces the same visible action within one frame or the player-reported seek tolerance.

- Check: Complete preview.
  Expected: Observation covers the first through final frame and the playback speed returns to 1x.

- Check: High-level caption policy.
  Expected: One or two simple sentences, clear task/goal, zero banned hand/operator terms.

- Check: Timeline continuity.
  Expected: First start is zero, final end equals duration, all segments have positive length, and each end equals the next start within one frame of tolerance.

- Check: Detailed-caption draft policy.
  Expected: Every action segment has a visible-action, present-tense, hand-and-object caption or a justified `NU`, `DO`, or `ID` label.

- Check: Read-only invariant.
  Expected: Initial and final annotation count, dirty state, and submit state match; no task data was saved or submitted.

- Check: Privacy cleanup.
  Expected: No task frames, manifests, credentials, private URLs, or task content remain in the repository or default persistent storage.

## Rollback

Phase 001 creates no platform annotations and installs nothing. If any browser state changes unexpectedly, stop immediately, use the platform's ordinary cancel/discard path only after showing the user what changed, and re-check the baseline. Remove only the explicitly created task-scoped temporary capture directory after resolving its absolute path. Close the test tab if the user requests it.
