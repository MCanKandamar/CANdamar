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
- [x] 4. Signal list left of the plot, grouped by source (DBC / CANopen PDO / SDO / Custom), filled automatically; short help when empty — verified: tsc + lint ✓, tried in browser (virtual bus)
- [x] 5. Per-signal scale and unit, saved; suggest ×0.001 V for names/units ending in "mV" — verified: tsc + lint ✓, tried in browser (mV→V, scale persisted)
- [x] 6. "Plot" button in the EDS object list: SDO read every 100 ms (decode with the EDS type), plotted; these periodic reads stay out of the SDO log — verified: pytest (29) + ruff ✓, tsc + lint ✓, tried in browser against a simulated node 13 with bldc_drive.eds (signed value, not logged); needs HW test
C. Tabs
- [x] 7. Each pane (main, right, bottom) has its own tabs; dragging a tab to the edge of the content area opens a pane (drop shadow), an empty pane closes — verified: tsc + lint + build ✓, tried in browser (edge drops, shadow, empty pane closes, no remount on move, 0.4.0 layout migrated)
- [x] 8. Send Frame / Record / Replay join the same tab system and can move between panes (no floating windows) — verified: tsc + lint + build ✓, tried in browser (Send Frame to the right pane, bottom closes when empty and reopens from the bottom edge)
D. slcan status
- [x] 9. slcan: poll `F` once a second, show error warning / passive, bus-off, overrun in the top bar (python-can's slcan driver ignores `Fxx` lines; small subclass; other interfaces unchanged) — verified: pytest (31) + ruff ✓, tsc + lint + build ✓, tried end to end with a fake TCP slcan adapter (socket://); needs HW test
E. Monitoring and polish
- [x] 10. Trace mode (time-ordered stream, pause, last 10k frames) — verified: tsc + lint + build ✓, tried in browser (follows the end, pause freezes Monitor and Trace)
- [x] 11. Highlight changed bytes in Monitor mode — verified: tsc + lint + build ✓, tried in browser
- [x] 12. Pause + hex/dec switch — verified: tsc + lint + build ✓, tried in browser (pause came with step 10; this step adds Hex/Dec)
- [x] 13. Save / load Send Frame lists + CANopen templates — verified: tsc + lint + build ✓, tried in browser against the simulated node 13 (templates answered, file load / bad file)
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
