# Project

## Overview
CANdamar is a local CAN bus analyzer: live message table, DBC decoding, signal plots, transmit, record/replay, J1939 and CANopen (CiA 301/402) decoders, SDO read/write and an EDS object browser. It runs as a local web app (`candamar` command, browser UI on localhost) or as a single-file Windows app (`CANdamar.exe`, WebView2 window). Fork of CANviz 0.3.1; distribution name `candamar`, commands `candamar` (alias `canviz`) and `candamar-desktop`. Not published on PyPI.

## Architecture
- `backend/canviz/` (Python module name kept as `canviz` for easy upstream sync): FastAPI app (`server.py`, `routers/`), python-can bus handling (`bus.py`), WebSocket frame broadcast (`ws_broadcaster.py`), stores for DBC / CANopen / J1939 / stats, SDO client with segmented upload (`sdo_client.py`), CLI (`cli.py`, typer), desktop window (`desktop.py`, pywebview + uvicorn thread, port 47800, data in `%LOCALAPPDATA%\CANdamar`, override `CANDAMAR_DATA_DIR`).
- `frontend/src/`: React 18 + Vite, zustand stores (`store/`), TanStack Table/Virtual (`components/MessageTable`), uPlot (`components/SignalPlot`, `store/customSignalStore.ts`). Workspace tabs + split view: `components/Workspace/Workspace.tsx`, `store/layoutStore.ts`; bottom panel: `components/Layout/BottomPanel.tsx`; CANopen panel (SDO log, read/write, EDS browser): `components/CANopenPanel`.
- The frontend build is written into `backend/canviz/static` (git-ignored) and served by the backend.
- `packaging/windows/`: PyInstaller spec and build script for `CANdamar.exe`.
- Rules: slcan-only features must not change the behaviour of other interfaces; keep upstream-compatible structure and names where possible.

## Environment
- Windows 11. Backend venv `backend/.venv` on Python 3.11 (`pip install -e ".[dev,desktop]"`); system default Python is 3.14, which pythonnet (pywebview) does not support — the exe build uses `C:\Users\msmca\AppData\Local\Programs\Python\Python311\python.exe`.
- Node.js + npm for the frontend (`npm ci` in `frontend/`).
- `gh` CLI is not installed; GitHub is used through the web UI.
- Browser pane testing: while the pane is hidden, ResizeObserver / requestAnimationFrame do not fire (plots and virtual lists may look empty).
- WebView2 fails to start (E_INVALIDARG) when the user-data path is about 260 characters; test with a short `CANDAMAR_DATA_DIR`.
- CI (GitHub Actions, `.github/workflows/`): `ci.yml` — backend ruff + pytest on Python 3.10–3.12, frontend tsc + eslint + build; `windows-exe.yml` — builds `CANdamar.exe` on `v*` tags (and by hand), smoke-tests it and attaches it to the GitHub Release.
- Hardware bench: the user's STM32F072 slcan adapter (own firmware, standard slcan: `L` listen-only, `F`, `N`, `Z`, `M`/`m`), BLDC drive as CANopen node 13 at 500 kbit/s, EDS at `C:\Users\msmca\Documents\STM32\015_BLDC_FOC_RTOS_MotorDrive\canopen\od\bldc_drive.eds` (0x2000 Vdc mV u16, 0x2001 speed rpm i16, 0x2010 speed ref i32, 0x2011 command u8). The drive has no TPDO yet.
- An older copy of the project remains at `C:\Users\msmca\projects\canviz` (left after the folder rename); do not use it.

## Decisions & constraints
<!-- Newest first. "YYYY-MM-DD · Decision: … · Why: …" or "YYYY-MM-DD · Constraint: … · Learned from: …".
Mark replaced entries "(superseded by YYYY-MM-DD)" instead of deleting them. -->
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
