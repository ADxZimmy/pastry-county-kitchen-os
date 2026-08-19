# UAT

## Scenario

The user opens a tutorial or expendable AnnoTasks video task in signed-in Chrome and authorizes a read-only feasibility check. The plugin candidate inspects the visible task controls, verifies shortcuts, observes the entire video, and returns a dry-run high-level caption plus continuous segment candidates without entering or saving any annotation.

## Result

Not run.

## Notes

Acceptance requires all of the following:

- The high-level caption states the task and goal in one or two sentences without a hand or operator reference.
- Segment candidates cover the complete video with no gaps or overlaps.
- Every candidate caption describes only visible action, names the working hand when applicable, distinguishes the object, and uses simple present tense; idle periods use `NU`, `DO`, or `ID`.
- The two lowest-confidence boundaries/captions are surfaced for user spot-checking.
- Annotation count, dirty state, and submit state are unchanged at the end.
- Temporary captures are removed.
