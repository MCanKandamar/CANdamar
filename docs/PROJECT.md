# Project

## Overview
CANdamar is a local CAN bus analyzer: live message table, DBC decoding, signal plots, transmit, record/replay, J1939 and CANopen (CiA 301/402) decoders, SDO read/write and an EDS object browser. It runs as a local web app (`candamar` command, browser UI on localhost) or as a single-file Windows app (`CANdamar.exe`, WebView2 window). Fork of CANviz 0.3.1; distribution name `candamar`, commands `candamar` (alias `canviz`) and `candamar-desktop`. Not published on PyPI.

## Architecture
- `backend/canviz/` (Python module name kept as `canviz` for easy upstream sync): FastAPI app (`server.py`, `routers/`), python-can bus handling (`bus.py`), WebSocket frame broadcast (`ws_broadcaster.py`), stores for DBC / CANopen / J1939 / stats, SDO client with segmented upload (`sdo_client.py`; reads can be `quiet` = kept out of the SDO log), slcan bus subclass that polls the `F` status flags once a second (`slcan_status.py`, used only for slcan), CLI (`cli.py`, typer), desktop window (`desktop.py`, pywebview + uvicorn thread, port 47800, data in `%LOCALAPPDATA%\CANdamar`, override `CANDAMAR_DATA_DIR`).
- `frontend/src/`: React 18 + Vite, zustand stores (`store/`), TanStack Table/Virtual (`components/MessageTable`: Monitor + `TraceTable.tsx`, trace ring buffer in `store/frameStore.ts`, view/pause/radix in `store/frameViewStore.ts`), uPlot (`components/SignalPlot` with `SignalList.tsx`; `store/plotStore.ts` holds sources, units and scales; `store/customSignalStore.ts`; periodic SDO plot reads in `store/sdoPollStore.ts`).
- Tabs: three panes (main, right, bottom), each with its own tab list (`store/layoutStore.ts`). `components/Workspace/Workspace.tsx` has `TabStrip`, `PaneBody` (drop zones) and renders every tab body once through a portal into a persistent host element that is moved between panes, so moving a tab never remounts it. The bottom pane frame (height, collapse) is `components/Layout/BottomPanel.tsx`. CANopen panel (SDO log, read/write, EDS browser, drive control in `DriveStatus.tsx`): `components/CANopenPanel`. Display density: `store/densityStore.ts` (`data-density` on `<html>`); font-size tokens `--fs-*` in `index.css`.
- The frontend build is written into `backend/canviz/static` (git-ignored) and served by the backend.
- `packaging/windows/`: PyInstaller spec and build script for `CANdamar.exe`.
- Rules: slcan-only features must not change the behaviour of other interfaces; keep upstream-compatible structure and names where possible.

## Environment
- Windows 11. Backend venv `backend/.venv` on Python 3.11 (`pip install -e ".[dev,desktop]"`); system default Python is 3.14, which pythonnet (pywebview) does not support — the exe build uses `C:\Users\msmca\AppData\Local\Programs\Python\Python311\python.exe`.
- Node.js + npm for the frontend (`npm ci` in `frontend/`).
- `gh` CLI is not installed; GitHub is used through the web UI.
- Browser pane testing: while the pane is hidden, ResizeObserver / requestAnimationFrame do not fire (plots and virtual lists may look empty).
- WebView2 fails to start (E_INVALIDARG) when the user-data path is about 260 characters; test with a short `CANDAMAR_DATA_DIR`.
- CI (GitHub Actions, `.github/workflows/`), runs on every push to any branch and on PRs to `main`: `ci.yml` — backend ruff + pytest on Python 3.10–3.12, frontend tsc + eslint + build; `windows-exe.yml` — builds `CANdamar.exe` and the `candamar` wheel (with the UI), smoke-tests the exe and uploads both as the `CANdamar-windows` artifact (14 days). On a `v*` tag it also checks the tag against `backend/pyproject.toml`, takes the release notes from the matching `## vX.Y.Z` section of `docs/CHANGELOG.md` and publishes the GitHub Release with the exe and the wheel.
- Release flow: work on a branch → PR into `main` (CI green) → bump `version` in `backend/pyproject.toml` and add the `## vX.Y.Z` CHANGELOG section → tag `vX.Y.Z` on `main` and push the tag (ask the user first).
- Hardware bench: the user's STM32F072 slcan adapter (own firmware, standard slcan: `L` listen-only, `F`, `N`, `Z`, `M`/`m`), BLDC drive as CANopen node 13 at 500 kbit/s, EDS at `C:\Users\msmca\Documents\STM32\015_BLDC_FOC_RTOS_MotorDrive\canopen\od\bldc_drive.eds` (0x2000 Vdc mV u16, 0x2001 speed rpm i16, 0x2010 speed ref i32, 0x2011 command u8). The drive has no TPDO yet.
- Test helpers used during 0.5.0 (not in the repo): a CANdamar server with a simulated CANopen node 13 on the same in-process virtual bus, and a fake slcan adapter over TCP (`socket://127.0.0.1:9999` as the slcan channel, pyserial URL). The virtual bus is in-process only, so a simulated node must run inside the server process.
- `npm run dev` (Vite, port 5173) proxies only `/api` and `/ws`; some components fetch without the `/api` prefix (CANopen panel, status sync), so test those against the built app served by the backend. The backend caches `index.html` at start: restart it after `npm run build`.
- An older copy of the project remains at `C:\Users\msmca\projects\canviz` (left after the folder rename); do not use it.

## Decisions & constraints
<!-- Newest first. "YYYY-MM-DD · Decision: … · Why: …" or "YYYY-MM-DD · Constraint: … · Learned from: …".
Mark replaced entries "(superseded by YYYY-MM-DD)" instead of deleting them. -->
- 2026-10-26 · Decision: tab bodies are portaled into persistent host elements that move between panes · Why: moving a tab must not reset its forms, scroll position or plot.
- 2026-10-26 · Decision: slcan `F` polling lives in a python-can `slcanBus` subclass that filters `Fxx` lines out of `_read` · Why: the stock driver drops those lines; other interfaces keep the stock classes.
- 2026-10-26 · Decision: CI and the exe build run on every branch push; release notes come from `docs/CHANGELOG.md` and the release also ships a wheel · Why: same flow as the user's firmware repo; branch builds give a testable exe before merging.
- 2026-10-25 · Decision: renamed the product to CANdamar but kept the Python module `canviz` · Why: upstream sync and PRs stay easy.
- 2026-10-24 · Decision: ruff rules pinned to `E4, E7, E9, F` · Why: newer ruff releases widen the default rule set and would fail CI (ruff is not pinned).
- 2026-10-24 · Decision: one commit per feature; upstream PRs are cherry-picked from `upstream/main` after the user's hardware test · Why: the fork may stay separate if upstream declines.
- 2026-10-24 · Decision: the right protocol panel was replaced by Chrome-style workspace tabs with split view · Why: the user could not see the frames table and protocol panels well together.

## References
- `README.md` — features, install, CLI, REST/WebSocket API, known limitations
- `docs/CHANGELOG.md` — release notes
- `docs/canopen.md`, `docs/j1939.md`, `docs/cli.md`, `docs/interfaceguide.md`
- `packaging/windows/README.md` — exe build
- `CONTRIBUTING.md`
