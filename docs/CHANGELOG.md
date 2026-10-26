# Changelog

All notable changes to CANdamar are documented here. Entries before v0.4.0 are
from [CANviz](https://github.com/Chanchaldhiman/CANviz), which CANdamar is forked from.
Versions follow [Semantic Versioning](https://semver.org/).

---

## v0.5.0 -- tabs in three panes, Trace view, plot over SDO, slcan status flags

### Added
- Tabs in three panes -- main, right and bottom each have their own tabs; Send Frame, Record and Replay are tabs too. Drag a tab to the right or bottom edge of a pane to open a pane there (a shadow shows where it goes); an empty pane closes. Moving a tab keeps its state
- Frames tab toolbar -- Monitor / Trace views, Pause (freezes the view, frames are still received), Hex / Dec data bytes
- Trace view -- the last 10,000 frames in arrival order with time, ID, data and protocol info; follows new frames while scrolled to the end
- Monitor view highlights the data bytes that changed since the previous frame of the same ID
- Frames table columns can be resized with the mouse (saved; double-click resets); the last column fills the row and holds the badges
- Plot signal list next to the plot, grouped by source (DBC, CANopen PDO, SDO, Custom), with live values and hints for empty groups
- Per-signal display scale and unit (saved); signals in mV get a one-click "->V"
- Plot button in the EDS object list -- reads the object by SDO every 100 ms (decoded with the EDS type) and plots it; values of SDO reads seen on the bus are plotted too
- `/canopen/sdo/read` returns `value` decoded with the EDS data type and accepts `quiet: true` to keep periodic reads out of the SDO log
- slcan status flags -- the adapter is asked for `F` once a second; error warning, error passive, bus error / bus-off and overrun are shown in the top bar (other interfaces unchanged)
- Drive Control -- mode of operation (0x6060), target velocity (0x60FF), statusword (0x6041) bits and state, read once or every 500 ms
- Send Frame -- optional name per frame, save / load the list as JSON (also kept across restarts), CANopen templates (NMT, node guarding, SYNC, SDO reads, controlword, heartbeat time)
- Compact density setting (top bar)
- CI runs on every branch; the Windows build also makes a wheel; releases take their notes from this file

### Changed
- Serial baud rates are shown as plain numbers (`115200`)
- Font sizes use shared tokens; nothing smaller than 10 px
- The layout is saved under a new key; a 0.4.0 layout is carried over

---

## v0.4.0 -- CANdamar (fork of CANviz 0.3.1)

First release under the CANdamar name. The Python package is now `candamar`
(command `candamar`, with `canviz` kept as an alias); the import module is still `canviz`.

### Added
- Workspace tabs -- Frames, CANopen, J1939 and Plot are Chrome-style tabs (drag to reorder) with split view to show two side by side; layout is saved
- Collapsible sidebar (top bar button, Ctrl+B) and bottom panel collapse / maximize
- Plot tab resizes with the window; custom signals plot raw bytes without a DBC (CAN ID, start byte, type, byte order, scale/offset)
- slcan: normal / listen-only mode (`L`), full S0-S8 bitrate list, `--listen-only` CLI flag
- Serial port list (`GET /ports`) with known slcan adapters flagged; COM port dropdown in the Connection panel
- Remote (RTR) frames: send from the Send Frame panel, RTR badge in the message table
- SDO Read with segmented upload -- values longer than 4 bytes; `/canopen/sdo/read` now returns the value
- Typed SDO Write -- enter numbers, bytes are encoded little-endian and previewed
- SDO log shows WRITE OK and decoded abort codes (`abort_code` in transactions)
- EDS object list (`GET /canopen/eds/objects`) in the Object Dictionary browser, with one-click Read / Write
- Windows app -- single-file `CANviz.exe` (PyInstaller + WebView2 window, `canviz-desktop` entry point, `desktop` extra); a GitHub Actions workflow builds it on `v*` tags and attaches it to the release
- ESLint flat config; `npm run lint` now works and runs in CI

### Changed
- The right-hand protocol panel is replaced by workspace tabs; Plot moved from the bottom panel to its own tab
- Read All Node Objects reads one object at a time and skips nodes that do not answer
- Ruff rule set pinned to the classic defaults so newer ruff releases do not break CI
- Replay uploads default to the OS temp folder (was `/tmp`, i.e. `C:\tmp` on Windows)
- API version comes from the package metadata (was hard-coded 0.2.4)
- Removed sample capture/decode output files (`backend/test.json`, `backend/decode.json`) and the remaining `canvaz` names

### Fixed
- Upload / download segment response names were swapped in the SDO decoder
- SDO Write object name lookup never matched exactly (`0X...` vs `0x...`)

---

## v0.3.1 -- CANopen CiA 301 + CiA 402

**CANopen decoder** -- passive protocol intelligence for robotics, industrial
automation, and motion control.

### Added
- Auto-detection of CANopen traffic from COB-ID structure
- Nodes table -- NMT state, heartbeat interval, frame count per discovered node
- CiA 402 drive state decoded from Statusword per node (Operation Enabled, Fault, Quick Stop etc.)
- CiA 402 Drive Control panel -- quick Controlword buttons (Enable, Switch On, Shutdown, Quick Stop, Disable, Fault Reset) with one-time safety notice
- EMCY decode -- error code, error class name, error register flags, manufacturer data
- SDO log -- request/response pairs auto-paired from bus traffic with names from 180-entry built-in CiA 301/402 object dictionary
- SDO Read and SDO Write -- send expedited reads and writes to live nodes from the panel
- NMT commands -- Operational, Pre-Op, Stop, Reset Node, Reset Comm with node selector and confirm step
- Object dictionary browser -- search 180 standard CiA 301/402 objects by name or index
- EDS / DCF file upload -- enables named PDO signal decode and PDO signals in Plot tab
- PDO signal plotting -- TPDO payloads decoded to named signals, fed into the existing plot store
- Read All Node Objects -- one click reads 15 standard objects from every discovered node
- Right panel layout -- protocol decoders (CANopen, J1939) moved to a dedicated full-height resizable right panel; bottom panel keeps 4 tool tabs (Send Frame, Record, Replay, Plot)
- Message table: Type, Node, Protocol Info columns when decoder active; EMCY and SDO badges per row
- REST endpoints: `/canopen/status`, `/canopen/mode`, `/canopen/reset`, `/canopen/eds`, `/canopen/sdo/read`, `/canopen/sdo/write`, `/canopen/nmt`, `/canopen/objects`, `/canopen/export`

### Fixed
- `ValueError: Unknown format code 'X' for object of type 'str'` in `full_status()` when CiA 402 default statusword was stored as formatted string instead of int
- `bus.py` log format string had 4 specifiers but 3 arguments -- crashed on every slcan connection

---

## v0.3.0 -- J1939 Passive Decoder

**J1939 passive decoder** -- zero-config protocol intelligence for trucks,
agriculture, and marine networks.

### Added
- Auto-detection of 29-bit extended-ID traffic at 250 kbps
- CAN ID decomposition: Priority, PGN, Source Address, Destination Address on every frame
- 54 built-in PGN name definitions (EEC1, CCVS, DM1, ET1, AMB, VEP1, TP.CM/DT and more)
- 99 source address names (ECU names per SAE J1939/81)
- BAM transport protocol reassembly -- multi-packet messages shown complete
- DM1 active fault decode -- SPN, component name, Failure Mode Indicator, occurrence count, lamp status
- Message table columns: PGN, PGN Name, SA, DA when decoder enabled
- BAM CM, BAM DT, and DM1 badges per message table row
- Light / dark theme toggle in top bar, persists across sessions
- J1939 decoder panel in bottom tab strip
- REST endpoints: `/j1939/status`, `/j1939/mode`

---

## v0.2.4 -- Hardware Support and Bug Fixes

### Added
- GY / Seeed Studio USB-CAN Analyzer support (`seeedstudio` interface) -- the `0xAA/0x55` binary protocol adapter widely sold on Amazon and AliExpress

### Fixed
- `The serial module is not installed` error -- `pyserial` added as declared dependency
- Sent frames not appearing in message table on seeedstudio and slcan interfaces -- non-loopback interfaces now echo sent frames in software
- `AttributeError` on first connect -- `self._open_serial_baudrate` not initialised in `BusManager.__init__`

---

## v0.2.0 -- Signal Plotting, CLI Mode, Bus Health

### Added
- Signal time-series plotting (uPlot) -- up to 8 signals on shared time axis, LTTB downsampling, 10 Hz render
- Adjustable time window (10s, 30s, 1m, 5m, 30m), zoom/pan, per-signal threshold lines with breach alerts, PNG export
- Always-visible bus health status bar -- frames Rx/Tx, bus load %, error frame count, bus-off events, throughput
- Multi-frame transmit with per-frame independent interval timers
- `canviz monitor` -- Rich live table in terminal, 4 Hz refresh, colour-coded by change direction
- `canviz serve --headless` -- FastAPI + WebSocket, no browser launch
- `canviz decode` -- reads log, outputs JSON or CSV to stdout
- `--no-browser` flag on default serve command
- Shell autocomplete for bash/zsh/fish via Typer
- COOP/COEP headers on FastAPI (`CrossOriginIsolationMiddleware`) for SharedArrayBuffer
- SendFramePanel rewrite -- multiple frame rows, per-frame interval timers, state survives tab switches
- DBC panel ID formatting fix -- backend returned hex string, frontend was prepending `0x` twice

### Fixed
- typer `[all]` extra removed in typer 0.12.1 -- changed to `typer>=0.12`
- Removed separate `rich>=13` dependency (now bundled with typer)

---

## v0.1.3 -- Core Release

- PyPI package `canviz` -- `pip install canviz` published
- Package rename `canvaz` to `canviz` (original name was taken)
- Frontend static build bundled as package data
- Windows hardware validation -- FYSETC UCAN plug-and-play confirmed
- Raspberry Pi validation -- socketcan interface confirmed
- SSH port forwarding workflow confirmed for remote Pi use
- Performance baseline -- 2,000 fps sustained, zero frame loss
- SocketCAN added to connection panel interface dropdown

---

## v0.1.0 -- First Release

- CAN interface module -- gs_usb, slcan, socketcan, virtual
- Frame model: id, dlc, data, timestamp, is_extended_id, is_fd, is_error_frame
- WebSocket endpoint `/ws/frames` -- live frame and stats stream
- REST endpoints: `/connect`, `/disconnect`, `/status`, `/stats`, `/send`
- DBC parsing via cantools -- file upload, signal decode attached to WebSocket frames
- Session logging -- `.asc` and `.csv` formats via aiofiles
- Live message table (TanStack Table + TanStack Virtual) -- ID, DLC, data, count, rate, last seen
- DBC signal panel -- file upload, decoded signals nested under message ID, raw/decoded toggle
- Filter bar -- by message ID (hex/range) and signal name, state in URL params
- Send frame panel -- ID, DLC, hex data, extended ID toggle
- Log controls -- start/stop recording, download `.asc` and `.csv`
- Replay panel -- upload log, play/pause/speed controls
- Settings panel -- interface/channel/bitrate without page reload
- Frontend bundled into pip package via `npm run build`
- Unit tests -- virtual bus throughout
