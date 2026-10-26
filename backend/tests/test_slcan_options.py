"""
tests/test_slcan_options.py
---------------------------
slcan-only connection options. No hardware: the slcan bus class is patched
so the slcan branch of _open_bus() returns a virtual bus while recording
the keyword arguments it was given. The 'F' status parsing runs against a
pyserial loop:// port.

Run: pytest tests/ -v
"""

import can
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

import canviz.bus
from canviz.bus import bus_manager
from canviz.slcan_status import StatusSlcanBus
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
    """Replace the slcan bus: slcan opens become virtual buses, kwargs are captured."""
    captured: dict = {}

    # A class, so isinstance() checks in bus.py keep working (and say "not slcan")
    class _FakeSlcanBus:
        def __new__(cls, **kwargs):
            captured.update(kwargs)
            return can.Bus(interface="virtual", channel="slcan-test")

    monkeypatch.setattr(canviz.bus, "StatusSlcanBus", _FakeSlcanBus)
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


def test_slcan_status_flags_parsed_from_stream():
    # loop:// echoes everything written; feed adapter answers into it by hand
    bus = StatusSlcanBus(channel="loop://", bitrate=500000, sleep_after_open=0)
    try:
        assert bus.status.snapshot()["flags"] is None

        port = bus.serialPortOrig
        port.write(b"F24\r")                 # error warning + error passive
        port.write(b"t1232ABCD\r")          # a frame right after it
        msg = bus.recv(0.5)
        assert msg is not None and msg.arbitration_id == 0x123 and msg.data == bytes([0xAB, 0xCD])
        snap = bus.status.snapshot()
        assert snap["flags"] == 0x24 and snap["recent"] == 0x24

        # A latched event stays in "recent" after the next clean answer
        port.write(b"F88\r")
        port.write(b"F00\r")
        assert bus.recv(0.2) is None
        snap = bus.status.snapshot()
        assert snap["flags"] == 0 and snap["recent"] == 0x24 | 0x88

        bus.request_status()                  # writes "F" (echoed back, not a valid answer)
        assert bus.recv(0.2) is None
    finally:
        bus.shutdown()


async def test_status_only_reported_for_slcan(client):
    r = await client.post("/connect", json={"interface": "virtual"})
    assert r.status_code == 200
    assert bus_manager.status_dict() == {"slcan_status": None}
