# Work
<!-- agent-lite v1. State, not instructions. Target ≤ 80 lines.
Never delete the active task, its plan, step status or evidence to meet the target.
When over the target, do all of these, in order: move lasting lessons and constraints from
Dead ends to PROJECT.md › Decisions & constraints (as "Constraint:"); drop obsolete dead ends; trim
Done to the newest items (git keeps history); shorten Next to one line per item; remove answered questions. -->

## Now
<!-- Task · branch · started date, then the plan. Mark the current step "(in progress)". Example:
Task: Password reset · branch: feature/reset · started: 2026-10-25
- [x] Token table + migration — verified: `npm test` ✓
- [ ] (in progress) Send reset e-mail
- [ ] Reset form -->
_No active task._

## Next
1. CANdamar 0.5.0 (plan agreed 2026-10-26; moves to Now when started)
2. After the user's hardware test (2026-10-27): prepare upstream CANviz PR branches cherry-picked from `upstream/main`

## Done
<!-- Newest first, one line each, with evidence label and commit if any. -->
- 2026-10-26 CI/CD: CI + exe build on every branch push, wheel in the artifact and release, release notes from CHANGELOG, tag/version check — verified locally: YAML parses, version check and notes extraction on CRLF copies (v0.4.0 ok, v0.5.0 rejected), `pip wheel` contains the UI; unverified on GitHub (not pushed)
- 2026-10-26 agent-lite installed (AGENTS.md, CLAUDE.md, docs/WORK.md, docs/PROJECT.md)

## Dead ends
<!-- date · what was tried · why it failed · when it might be worth retrying -->

## Open questions
<!-- question · impact · default used meanwhile -->
- Publish `candamar` on PyPI? · install from source only · meanwhile: not published
- Delete the old copy `C:\Users\msmca\projects\canviz`? · disk clutter, risk of editing the wrong folder · meanwhile: left in place
