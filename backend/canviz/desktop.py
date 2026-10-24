"""
canviz/desktop.py
-----------------
Desktop launcher: runs the CANviz server in a background thread and shows
the UI in a native window (pywebview, Microsoft Edge WebView2 on Windows).
This is the entry point of the one-file Windows executable.

  canviz-desktop                 # open the app window
  canviz-desktop --no-window     # server only (smoke tests, debugging)

Closing the window stops the server; the FastAPI lifespan shutdown then
releases the CAN adapter (COM port / USB handle).

Data (recordings, replay uploads, the log file and WebView2 storage) lives
in %LOCALAPPDATA%\\CANviz on Windows, ~/.canviz elsewhere, or in the folder
given by the CANVIZ_DATA_DIR environment variable.

Requires the optional dependency: pip install canviz[desktop]
"""

from __future__ import annotations

import argparse
import logging
import os
import socket
import sys
import threading
import time
from pathlib import Path

APP_NAME     = "CANviz"
DEFAULT_PORT = 47800   # fixed, so the page origin (and its saved layout) stays the same
WEBVIEW2_URL = "https://developer.microsoft.com/microsoft-edge/webview2/"

log = logging.getLogger("canviz.desktop")


def _data_dir() -> Path:
    override = os.environ.get("CANVIZ_DATA_DIR")      # portable use / tests
    base = os.environ.get("LOCALAPPDATA")
    if override:
        path = Path(override)
    else:
        path = Path(base) / APP_NAME if base else Path.home() / ".canviz"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _setup_logging(data_dir: Path) -> Path:
    log_file = data_dir / "canviz.log"
    handlers: list[logging.Handler] = [logging.FileHandler(log_file, encoding="utf-8")]
    if sys.stderr is not None:
        handlers.append(logging.StreamHandler())   # started from a console
    else:
        # A windowed (no console) executable has no stdout/stderr; anything
        # that print()s would fail writing to None, so send it to the log file.
        stream = open(log_file, "a", encoding="utf-8", buffering=1)  # noqa: SIM115
        sys.stdout = sys.stdout or stream
        sys.stderr = stream
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s - %(message)s",
        handlers=handlers,
    )
    return log_file


def _port_is_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(("127.0.0.1", port))
        except OSError:
            return False
    return True


def _pick_port(preferred: int) -> int:
    if _port_is_free(preferred):
        return preferred
    # Another instance (or another program) holds the port: let the OS choose
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    log.warning("Port %d is busy, using %d (saved UI layout is per port)", preferred, port)
    return port


def _wait_until_up(server, thread: threading.Thread, timeout: float = 20.0) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if server.started:
            return True
        if not thread.is_alive():
            return False
        time.sleep(0.05)
    return False


def _show_error(message: str) -> None:
    log.error(message)
    if sys.platform == "win32":
        import ctypes
        ctypes.windll.user32.MessageBoxW(None, message, APP_NAME, 0x10)   # MB_ICONERROR
    else:
        print(message, file=sys.stderr)


def main() -> None:
    parser = argparse.ArgumentParser(prog="canviz-desktop", description="CANviz desktop app")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="local server port")
    parser.add_argument("--no-window", action="store_true", help="run the server only")
    parser.add_argument("--debug", action="store_true",
                        help="debug logging and WebView developer tools")
    args = parser.parse_args()

    data_dir = _data_dir()
    log_file = _setup_logging(data_dir)
    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)

    # Recordings (logs/) and replay uploads go to the data folder, not to
    # wherever the executable happens to be started from.
    os.chdir(data_dir)
    os.environ.setdefault("canviz_UPLOAD_DIR", str(data_dir / "replay"))

    import uvicorn

    from canviz.server import app

    port   = _pick_port(args.port)
    config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="info", log_config=None)
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, name="canviz-server", daemon=True)
    thread.start()

    if not _wait_until_up(server, thread):
        _show_error(f"The CANviz server did not start. See the log file:\n{log_file}")
        sys.exit(1)

    url = f"http://127.0.0.1:{port}/"
    log.info("CANviz server running at %s (data: %s)", url, data_dir)

    try:
        if args.no_window:
            thread.join()
        else:
            _run_window(url, data_dir, log_file, args.debug)
    except KeyboardInterrupt:
        pass
    finally:
        # Lifespan shutdown closes the bus, which releases the COM port
        server.should_exit = True
        thread.join(timeout=10)


LOAD_TIMEOUT_S = 20


def _run_window(url: str, data_dir: Path, log_file: Path, debug: bool) -> None:
    try:
        import webview
    except ImportError:
        _show_error("pywebview is not installed: pip install canviz[desktop]")
        sys.exit(1)

    # Recordings (.asc/.csv) and PNG exports are browser downloads
    webview.settings["ALLOW_DOWNLOADS"] = True

    window = webview.create_window(
        APP_NAME,
        url,
        width=1440,
        height=900,
        min_size=(960, 600),
    )
    loaded = threading.Event()
    window.events.loaded += loaded.set

    def watchdog() -> None:
        # pywebview only logs WebView2 start-up failures, which leaves an
        # empty window. Fall back to the default browser in that case.
        if loaded.wait(LOAD_TIMEOUT_S):
            return
        log.error("The window did not load %s; opening the default browser", url)
        import webbrowser
        webbrowser.open(url)
        _show_error(
            "The CANviz window could not display the app (Microsoft Edge WebView2 problem).\n\n"
            f"CANviz is open in your web browser instead: {url}\n"
            "Close the CANviz window to stop it.\n\n"
            f"WebView2 Runtime: {WEBVIEW2_URL}\nLog file: {log_file}"
        )

    gui = "edgechromium" if sys.platform == "win32" else None
    try:
        # private_mode=False keeps localStorage (layout, custom signals) between runs
        webview.start(
            func=watchdog,
            gui=gui,
            debug=debug,
            private_mode=False,
            storage_path=str(data_dir / "webview"),
        )
    except Exception as exc:
        log.exception("WebView failed to start")
        _show_error(
            "CANviz needs the Microsoft Edge WebView2 Runtime.\n\n"
            f"Install it from {WEBVIEW2_URL} and start CANviz again.\n\n"
            f"Details: {exc}"
        )


if __name__ == "__main__":
    main()
