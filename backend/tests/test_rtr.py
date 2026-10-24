"""
tests/test_rtr.py
-----------------
Remote (RTR) frame transmit on the virtual bus (no hardware required).

Run: pytest tests/ -v
"""

import asyncio

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


async def test_send_remote_frame(client):
    r = await client.post("/connect", json={"interface": "virtual"})
    assert r.status_code == 200

    received = []
    bus_manager.add_frame_callback(received.append)
    try:
        r = await client.post("/send", json={
            "id": 0x70D, "is_remote_frame": True, "dlc": 1, "data": [0xAA],
        })
        assert r.status_code == 200
        assert r.json()["rtr"] is True

        for _ in range(20):
            if received:
                break
            await asyncio.sleep(0.05)
    finally:
        bus_manager.remove_frame_callback(received.append)

    msg = received[0]
    assert msg.arbitration_id == 0x70D
    assert msg.is_remote_frame
    assert msg.dlc == 1
    assert len(msg.data) == 0   # data is never sent with a remote frame


async def test_remote_frame_dlc_range(client):
    await client.post("/connect", json={"interface": "virtual"})
    r = await client.post("/send", json={"id": 0x123, "is_remote_frame": True, "dlc": 9})
    assert r.status_code == 400
