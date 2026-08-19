# Roadmap

## Now

- Phase: 001 Platform And Policy Feasibility Spike
  Outcome: A read-only dry run proves whether Codex can observe one tutorial or expendable AnnoTasks task in the user's Chrome session, verify the active shortcut mapping, sample/refine visible frames, and produce a high-level caption plus continuous segment candidates without changing the task.
  Status: Planned only. No browser run or platform write is authorized by the current request.

## Next

- Phase: 002 Personal Plugin Scaffold And Caption Policy
  Outcome: A valid `annotasks-video-captioner` personal plugin is scaffolded with `.codex-plugin/plugin.json`, a focused skill, the supplied guidelines as a reference, deterministic caption/timeline validation, and a personal marketplace entry. No browser writing yet.
  Entry gate: Phase 001 selects a viable observation path and the user authorizes implementation.

- Phase: 003 Browser-Assisted Observation And Drafting
  Outcome: The plugin performs preflight, previews the whole video, creates a draft high-level caption, proposes action boundaries, refines them frame-by-frame, and presents a dry-run annotation manifest for review.
  Entry gate: The page can be observed reliably without credential inspection or protected-media extraction.

- Phase: 004 Controlled Encord Writing And Review
  Outcome: The plugin writes an approved high-level caption, creates continuous ranges, evaluates generated caption options, minimally corrects them, reuses repeated captions, applies `NU`/`DO`/`ID`, and stops at the final submission gate.
  Entry gate: The user's agreement permits assisted field entry, dry-run quality meets the threshold, and task-state checks are reliable.

## Later

- Phase: 005 Benchmark, Hardening, And Personal Release
  Outcome: At least five representative tutorial videos establish at least 80% reviewer-approved segmentation/caption accuracy and a median time of seven minutes or less per one-minute video; UI-drift, retry, privacy cleanup, and interruption tests pass; the plugin validates and is ready for personal installation. Boundary comparisons use frame-aware tolerance, caption scoring treats any invented action/object/hand as a failure, and timing starts at preview and ends before the user-controlled submit action.

- Phase: 006 Optional Browser Bridge
  Outcome: A narrow local MCP/browser bridge is added only if Phase 001 or sustained UAT shows that the installed Chrome-control surface cannot reliably seek, observe, or verify the video timeline.
  Status: Contingency, not part of the MVP architecture.

## Release Gates

1. Read-only feasibility passes without task mutation.
2. Automation permission is confirmed.
3. Draft-only benchmark reaches at least 80% quality.
4. Controlled writes are idempotent and fail closed on UI drift.
5. Coverage validator proves first-frame-to-last-frame continuity with no gaps or overlaps.
6. Every detailed caption passes the visible-action, hand, object, and tense checks or is explicitly labeled `NU`, `DO`, or `ID`.
7. Final submission remains visibly separate and user-confirmed.
8. Plugin validation passes and temporary video artifacts are cleaned.
