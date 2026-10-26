"""
tests/test_sdo_client.py
------------------------
SDO reads against a simulated CANopen node on the virtual bus.

The fake node (node 13) runs in a thread on its own virtual bus instance
and answers SDO uploads:
  0x2000:0  expedited, UNSIGNED16 24055 (F7 5D)
  0x2001:0  expedited, INTEGER16 -1000 (18 FC)
  0x1008:0  segmented, VISIBLE_STRING "BLDC drive demo" (15 bytes -> 3 segments)
  0x3000:0  never answers (timeout)
  anything else -> abort 0x06020000 (object does not exist)

Run: pytest tests/ -v
"""

import threading

import can
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from canviz.bus import bus_manager
from canviz.canopen_store import canopen_store, eds_store
from canviz.server import app
from canviz.ws_broadcaster import broadcaster

NODE_ID     = 13
DEVICE_NAME = b"BLDC drive demo"


class FakeSdoServer(threading.Thread):
    def __init__(self) -> None:
        super().__init__(daemon=True)
        # Same channel name as BusManager's virtual bus ("vcan0")
        self.bus  = can.Bus(interface="virtual", channel="vcan0")
        self.stop = threading.Event()
        self._upload: bytes = b""
        self._pos = 0
        self.segment_requests = 0

    def _reply(self, data: list[int]) -> None:
        self.bus.send(can.Message(arbitration_id=0x580 + NODE_ID, data=data, is_extended_id=False))

    def run(self) -> None:
        while not self.stop.is_set():
            msg = self.bus.recv(0.05)
            if msg is None or msg.arbitration_id != 0x600 + NODE_ID:
                continue
            d = msg.data
            cmd = d[0]
            index, sub = d[1] | (d[2] << 8), d[3]
            if cmd == 0x40:
                mux = list(d[1:4])
                if (index, sub) == (0x2000, 0):
                    self._reply([0x4B, *mux, 0xF7, 0x5D, 0, 0])
                elif (index, sub) == (0x2001, 0):
                    self._reply([0x4B, *mux, 0x18, 0xFC, 0, 0])
                elif (index, sub) == (0x1008, 0):
                    self._upload, self._pos = DEVICE_NAME, 0
                    self._reply([0x41, *mux, len(DEVICE_NAME), 0, 0, 0])
                elif (index, sub) == (0x3000, 0):
                    pass   # silent -> client timeout
                else:
                    self._reply([0x80, *mux, 0x00, 0x00, 0x02, 0x06])
            elif cmd & 0xE0 == 0x60:          # upload segment request
                self.segment_requests += 1
                toggle = cmd & 0x10
                chunk  = self._upload[self._pos:self._pos + 7]
                self._pos += len(chunk)
                last   = self._pos >= len(self._upload)
                unused = 7 - len(chunk)
                self._reply([toggle | (unused << 1) | (1 if last else 0), *chunk, *([0] * unused)])

    def close(self) -> None:
        self.stop.set()
        self.join(1)
        self.bus.shutdown()


@pytest_asyncio.fixture(autouse=True)
async def clean_state():
    yield
    bus_manager.remove_frame_callback(broadcaster.on_frame)
    await bus_manager.disconnect()
    await broadcaster.stop()
    canopen_store.set_mode("off")
    canopen_store.reset()
    eds_store.clear()


@pytest_asyncio.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.fixture
def node():
    server = FakeSdoServer()
    server.start()
    yield server
    server.close()


async def _connect(client) -> None:
    r = await client.post("/connect", json={"interface": "virtual"})
    assert r.status_code == 200
    await client.post("/canopen/mode", json={"mode": "on"})


async def test_expedited_read(client, node):
    await _connect(client)
    r = await client.post("/canopen/sdo/read", json={"node_id": NODE_ID, "index": 0x2000})
    body = r.json()
    assert r.status_code == 200 and body["ok"]
    assert body["segmented"] is False
    assert body["data_hex"] == "F7 5D"
    assert body["value_int"] == 24055


async def test_segmented_read_and_sdo_log(client, node):
    await _connect(client)
    r = await client.post("/canopen/sdo/read", json={"node_id": NODE_ID, "index": 0x1008})
    body = r.json()
    assert r.status_code == 200 and body["ok"]
    assert body["segmented"] is True
    assert body["value_text"] == DEVICE_NAME.decode()
    assert body["size"] == len(DEVICE_NAME)
    assert node.segment_requests == 3

    # The log entry is completed with the full value
    status = (await client.get("/canopen/status")).json()
    entry = next(t for t in status["recent_sdo"] if t["index"] == "0x1008")
    assert entry["value_text"] == DEVICE_NAME.decode()
    assert entry["response_cmd"] == f"Upload Response (segmented, {len(DEVICE_NAME)}B)"


async def test_abort_returns_code(client, node):
    await _connect(client)
    r = await client.post("/canopen/sdo/read", json={"node_id": NODE_ID, "index": 0x6040})
    body = r.json()
    assert r.status_code == 200
    assert body["ok"] is False
    assert body["abort_code"] == "0x06020000"

    status = (await client.get("/canopen/status")).json()
    entry = next(t for t in status["recent_sdo"] if t["index"] == "0x6040")
    assert entry["is_abort"] and entry["abort_code"] == "0x06020000"


async def test_timeout(client, node):
    await _connect(client)
    r = await client.post("/canopen/sdo/read", json={"node_id": NODE_ID, "index": 0x3000})
    assert r.status_code == 504


async def test_quiet_read_stays_out_of_sdo_log(client, node):
    await _connect(client)
    r = await client.post(
        "/canopen/sdo/read", json={"node_id": NODE_ID, "index": 0x2000, "quiet": True},
    )
    assert r.status_code == 200 and r.json()["value_int"] == 24055

    status = (await client.get("/canopen/status")).json()
    assert not [t for t in status["recent_sdo"] if t["index"] == "0x2000"]

    # A normal read of another object is still logged
    await client.post("/canopen/sdo/read", json={"node_id": NODE_ID, "index": 0x2001})
    status = (await client.get("/canopen/status")).json()
    assert [t for t in status["recent_sdo"] if t["index"] == "0x2001"]


DRIVE_EDS = b"""\
[FileInfo]
FileName=drive.eds
[DeviceInfo]
VendorName=Test
[MandatoryObjects]
SupportedObjects=1
1=0x1000
[1000]
ParameterName=Device type
ObjectType=0x7
DataType=0x0007
AccessType=ro
DefaultValue=0
PDOMapping=0
[ManufacturerObjects]
SupportedObjects=1
1=0x2001
[2001]
ParameterName=Speed rpm
ObjectType=0x7
DataType=0x0003
AccessType=ro
DefaultValue=0
PDOMapping=1
"""


async def test_value_decoded_with_eds_type(client, node):
    await _connect(client)
    r = await client.post("/canopen/sdo/read", json={"node_id": NODE_ID, "index": 0x2001})
    body = r.json()
    assert body["value_int"] == 0xFC18 and body["value"] is None   # no EDS: unsigned only

    assert eds_store.load(DRIVE_EDS, "drive.eds")["ok"]
    r = await client.post("/canopen/sdo/read", json={"node_id": NODE_ID, "index": 0x2001})
    assert r.json()["value"] == -1000                                  # INTEGER16

    # The SDO log transaction carries the typed value too
    status = (await client.get("/canopen/status")).json()
    entry = next(t for t in status["recent_sdo"] if t["index"] == "0x2001")
    assert entry["value"] == -1000
