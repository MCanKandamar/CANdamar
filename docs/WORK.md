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
Task: CANdamar 0.5.0 · branch: feature/v0.5.0 (on top of chore/agent-lite-ci) · plan agreed 2026-10-26
One commit per step; push, tag and release only after asking. The user tests on hardware 2026-10-27.
A. Frames table
- [x] 1. Mouse-resizable columns (TanStack column resizing), saved, double-click = default width — verified: tsc + lint ✓, tried in browser (virtual bus)
- [x] 2. Last data column fills the remaining width; Protocol Info shows in full when it fits, badges inside that column — verified: tsc + lint ✓, tried in browser (virtual bus)
- [x] 3. Baudrate shown as `115200` (plain digits) — verified: tsc + lint ✓, tried in browser (virtual bus)
B. Plot
- [ ] 4. Signal list left of the plot, grouped by source (DBC / CANopen PDO / SDO / Custom), filled automatically; short help when empty
- [ ] 5. Per-signal scale and unit, saved; suggest ×0.001 V for names/units ending in "mV"
- [ ] 6. "Plot" button in the EDS object list: SDO read every 100 ms (decode with the EDS type), plotted; these periodic reads stay out of the SDO log
C. Tabs
- [ ] 7. Each pane (main, right, bottom) has its own tabs; dragging a tab to the edge of the content area opens a pane (drop shadow), an empty pane closes
- [ ] 8. Send Frame / Record / Replay join the same tab system and can move between panes (no floating windows)
D. slcan status
- [ ] 9. slcan: poll `F` once a second, show error warning / passive, bus-off, overrun in the top bar (python-can's slcan driver ignores `Fxx` lines; small subclass; other interfaces unchanged)
E. Monitoring and polish
- [ ] 10. Trace mode (time-ordered stream, pause, last 10k frames)
- [ ] 11. Highlight changed bytes in Monitor mode
- [ ] 12. Pause + hex/dec switch
- [ ] 13. Save / load Send Frame lists + CANopen templates
- [ ] 14. Visual clean-up (shared CSS classes, consistent font sizes, density setting)
F. Drive
- [ ] 15. Drive Control: mode of operation 0x6060, target velocity 0x60FF, statusword bits shown one by one (drive CANopen phases 4–5)
- [ ] 16. Docs + CHANGELOG, v0.5.0 (ask before bump / tag)

## Next
1. After the user's hardware test (2026-10-27): prepare upstream CANviz PR branches cherry-picked from `upstream/main`

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
