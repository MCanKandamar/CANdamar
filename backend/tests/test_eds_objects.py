"""
tests/test_eds_objects.py
-------------------------
GET /canopen/eds/objects with a small inline EDS (no hardware required).

Run: pytest tests/ -v
"""

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from canviz.canopen_store import eds_store
from canviz.server import app

EDS = """\
[FileInfo]
FileName=test.eds
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
[OptionalObjects]
SupportedObjects=1
1=0x1018
[1018]
ParameterName=Identity
ObjectType=0x9
SubNumber=2
[1018sub0]
ParameterName=Highest sub-index supported
ObjectType=0x7
DataType=0x0005
AccessType=ro
DefaultValue=1
PDOMapping=0
[1018sub1]
ParameterName=Vendor-ID
ObjectType=0x7
DataType=0x0007
AccessType=ro
DefaultValue=0
PDOMapping=0
[ManufacturerObjects]
SupportedObjects=2
1=0x2000
2=0x2010
[2000]
ParameterName=Vdc mV
ObjectType=0x7
DataType=0x0006
AccessType=ro
DefaultValue=0
PDOMapping=1
[2010]
ParameterName=Speed ref rpm
ObjectType=0x7
DataType=0x0004
AccessType=rww
DefaultValue=0
PDOMapping=1
"""


@pytest_asyncio.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    eds_store.clear()


async def test_eds_objects_404_without_eds(client):
    eds_store.clear()
    r = await client.get("/canopen/eds/objects")
    assert r.status_code == 404


async def test_eds_objects_list_and_filter(client):
    r = await client.post("/canopen/eds", files={"file": ("test.eds", EDS.encode())})
    assert r.status_code == 200

    r = await client.get("/canopen/eds/objects")
    results = r.json()["results"]
    keys = [(o["index"], o["subindex"]) for o in results]
    assert keys == [("0x1000", 0), ("0x1018", 0), ("0x1018", 1), ("0x2000", 0), ("0x2010", 0)]

    vendor = results[2]
    assert vendor["name"] == "Identity: Vendor-ID"
    assert vendor["data_type"] == "UNSIGNED32"

    r = await client.get("/canopen/eds/objects", params={"q": "speed"})
    (speed,) = r.json()["results"]
    assert speed == {
        "index": "0x2010", "subindex": 0, "name": "Speed ref rpm",
        "data_type": "INTEGER32", "access": "rww", "default": "0", "unit": "",
    }

    r = await client.get("/canopen/eds/objects", params={"q": "0x2000"})
    assert [o["name"] for o in r.json()["results"]] == ["Vdc mV"]
