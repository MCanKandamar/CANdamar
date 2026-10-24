"""
tests/test_ports.py
-------------------
GET /ports with a patched pyserial port list (no hardware required).

Run: pytest tests/ -v
"""

from types import SimpleNamespace

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from serial.tools import list_ports

from canviz.server import app


@pytest_asyncio.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


def _port(device, vid=None, pid=None, description="n/a"):
    return SimpleNamespace(
        device=device, vid=vid, pid=pid, description=description,
        manufacturer=None, serial_number=None,
    )


async def test_ports_flags_known_adapters_and_sorts_naturally(client, monkeypatch):
    monkeypatch.setattr(list_ports, "comports", lambda: [
        _port("COM15", 0x0483, 0x5740, "USB Serial Device"),
        _port("COM3", description="Standard Serial over Bluetooth link"),
        _port("COM9", 0x1A86, 0x7523, "USB-SERIAL CH340"),
    ])
    r = await client.get("/ports")
    assert r.status_code == 200
    ports = r.json()["ports"]

    assert [p["device"] for p in ports] == ["COM3", "COM9", "COM15"]
    by_dev = {p["device"]: p for p in ports}
    assert by_dev["COM15"]["adapter"] == "STM32 Virtual COM Port (slcan)"
    assert by_dev["COM15"]["vid"] == "0483" and by_dev["COM15"]["pid"] == "5740"
    assert by_dev["COM9"]["usb"] is True and by_dev["COM9"]["adapter"] is None
    assert by_dev["COM3"]["usb"] is False and by_dev["COM3"]["vid"] is None
