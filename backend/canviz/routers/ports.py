"""
canviz/routers/ports.py
-----------------------
Serial port discovery for the COM-port interfaces (slcan, seeedstudio).

GET /ports - list serial ports with USB VID/PID; ports whose VID:PID
             belongs to a known slcan adapter are flagged in "adapter".
"""

from __future__ import annotations

import re

from fastapi import APIRouter

router = APIRouter(tags=["connection"])

# USB VID:PID pairs of adapters that commonly run slcan firmware
_KNOWN_ADAPTERS: dict[tuple[int, int], str] = {
    (0x0483, 0x5740): "STM32 Virtual COM Port (slcan)",
    (0x16D0, 0x117E): "CANable (slcan)",
}


def _natural_key(device: str) -> list:
    # COM3 < COM15 (plain string sort would put COM15 first)
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", device)]


@router.get("/ports")
async def list_ports():
    """List serial ports. `adapter` is set for known slcan adapters, `usb` for USB devices."""
    try:
        from serial.tools import list_ports as serial_list_ports
    except ImportError:
        return {"ports": [], "error": "pyserial is not installed"}

    ports = []
    for p in sorted(serial_list_ports.comports(), key=lambda p: _natural_key(p.device)):
        has_usb_ids = p.vid is not None and p.pid is not None
        ports.append({
            "device":        p.device,
            "description":   p.description,
            "manufacturer":  p.manufacturer,
            "vid":           f"{p.vid:04X}" if has_usb_ids else None,
            "pid":           f"{p.pid:04X}" if has_usb_ids else None,
            "serial_number": p.serial_number,
            "usb":           has_usb_ids,
            "adapter":       _KNOWN_ADAPTERS.get((p.vid, p.pid)) if has_usb_ids else None,
        })
    return {"ports": ports}
