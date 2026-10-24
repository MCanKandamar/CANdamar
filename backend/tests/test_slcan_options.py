"""
tests/test_slcan_options.py
---------------------------
slcan-only connection options. No hardware: can.Bus is patched so the
slcan branch of _open_bus() returns a virtual bus while recording the
keyword arguments it was given.

Run: pytest tests/ -v
"""

import can
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from canviz.bus import bus_manager
from canviz.server import app
from canviz.ws_broadcaster import broadcaster


@pytest_asyncio.fixture(autouse=True)
async def clean_state():
    yield
    bus_manager.remove_frame_callback(broadcaster.on_frame)
    await bus_manager.disconnect()
    await broadcaster.stop()


@pytest_asyncio.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.fixture
def fake_slcan(monkeypatch):
    """Replace can.Bus: slcan opens become virtual buses, kwargs are captured."""
    real_bus = can.Bus
    captured: dict = {}

    def _bus(**kwargs):
        if kwargs.get("interface") == "slcan":
            captured.update(kwargs)
            return real_bus(interface="virtual", channel="slcan-test")
        return real_bus(**kwargs)

    monkeypatch.setattr(can, "Bus", _bus)
    return captured


async def test_slcan_listen_only_opens_with_flag_and_blocks_send(client, fake_slcan):
    r = await client.post("/connect", json={
        "interface": "slcan", "channel": "COM99", "bitrate": 500000, "listen_only": True,
    })
    assert r.status_code == 200
    assert r.json()["listen_only"] is True
    assert fake_slcan["listen_only"] is True

    # The adapter never transmits in listen-only mode -- send must refuse
    r = await client.post("/send", json={"id": 0x123, "data": [1, 2]})
    assert r.status_code == 500
    assert "Listen-only" in r.json()["detail"]


async def test_slcan_normal_mode_by_default(client, fake_slcan):
    r = await client.post("/connect", json={"interface": "slcan", "channel": "COM99"})
    assert r.status_code == 200
    assert r.json()["listen_only"] is False
    assert fake_slcan["listen_only"] is False

    r = await client.post("/send", json={"id": 0x123, "data": [1, 2]})
    assert r.status_code == 200


async def test_listen_only_ignored_for_other_interfaces(client):
    r = await client.post("/connect", json={"interface": "virtual", "listen_only": True})
    assert r.status_code == 200
    assert r.json()["listen_only"] is False

    r = await client.post("/send", json={"id": 0x123, "data": [1]})
    assert r.status_code == 200
