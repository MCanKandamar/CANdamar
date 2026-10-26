"""
canviz/slcan_status.py
----------------------
slcan adapter status flags (LAWICEL 'F' command).

python-can's slcan driver never sends 'F' and drops the 'Fxx' answer line
it does not recognise. StatusSlcanBus adds both: request_status() writes
'F', and the answer is taken out of the receive stream into `status`.
Only the slcan interface uses this class; other interfaces are unchanged.

Answer: 'F' + two hex digits (LAWICEL CANUSB manual):
  0x01 RX queue full     0x02 TX queue full     0x04 error warning
  0x08 data overrun      0x20 error passive     0x40 arbitration lost
  0x80 bus error (the STM32 slcan firmware also sets it while bus-off)
Example: "F24\\r" = error warning + error passive.

Overrun, arbitration lost and bus error are events that the adapter clears
once it has reported them, so a single poll may be the only time they are
seen. The snapshot therefore also keeps every bit seen in the last HOLD_S
seconds ("recent"), which is what the UI shows.
"""

from __future__ import annotations

import threading
import time
from typing import Optional

from can.interfaces.slcan import slcanBus

HOLD_S = 5.0   # how long a reported bit stays in "recent"

STATUS_BITS: dict[int, str] = {
    0x01: "rx_full",
    0x02: "tx_full",
    0x04: "error_warning",
    0x08: "overrun",
    0x20: "error_passive",
    0x40: "arbitration_lost",
    0x80: "bus_error",
}


class SlcanStatus:
    """Last 'F' answer of the adapter; updated from the reader thread."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._flags: Optional[int] = None
        self._updated: Optional[float] = None
        self._seen: dict[int, float] = {}    # bit -> monotonic time last reported

    def update(self, flags: int) -> None:
        now = time.monotonic()
        with self._lock:
            self._flags   = flags
            self._updated = now
            for bit in STATUS_BITS:
                if flags & bit:
                    self._seen[bit] = now

    def snapshot(self) -> dict:
        now = time.monotonic()
        with self._lock:
            recent = 0
            for bit, t in self._seen.items():
                if now - t <= HOLD_S:
                    recent |= bit
            return {
                "flags":  self._flags,
                "recent": recent,
                "age_s":  None if self._updated is None else round(now - self._updated, 1),
            }


class StatusSlcanBus(slcanBus):
    """slcan bus that can poll the adapter's status flags with 'F'."""

    def __init__(self, *args, **kwargs) -> None:
        # Set before the base class opens the port (it already writes commands)
        self.status = SlcanStatus()
        self._write_lock = threading.Lock()
        super().__init__(*args, **kwargs)

    def _write(self, string: str) -> None:
        # Status polls come from another thread than send(); keep commands whole
        with self._write_lock:
            super()._write(string)

    def _read(self, timeout: Optional[float]) -> Optional[str]:
        string = super()._read(timeout)
        if string and string[0] == "F" and len(string) >= 3:
            try:
                flags = int(string[1:3], 16)
            except ValueError:
                return string
            self.status.update(flags)
            return None      # not a frame -- recv() keeps waiting until its timeout
        return string

    def request_status(self) -> None:
        """Ask for the status flags; the answer arrives through the reader."""
        self._write("F")
