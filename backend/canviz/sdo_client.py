"""
canviz/sdo_client.py
--------------------
Active SDO client (CiA 301) used by the REST endpoints for reads.

Expedited uploads (<= 4 bytes) finish with the first response. Segmented
uploads (> 4 bytes, e.g. 0x1008 Manufacturer Device Name) are driven here:
upload segment requests with an alternating toggle bit until the server
sets the 'c' (no more segments) bit.

Frames arrive through BusManager frame callbacks, so the client runs next
to the passive decoder in canopen_store without owning the bus. Requests
to the same node are serialised -- a CANopen server handles one SDO
transfer at a time.

SDO command bytes used here (byte 0 of the frame):
  0x40              initiate upload request
  0x60 / 0x70       upload segment request, toggle bit 0 / 1
  0x80              abort transfer (abort code in bytes 4-7, little-endian)
  scs = cmd >> 5    server command specifier: 2 = initiate upload response,
                    0 = upload segment response
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Optional

log = logging.getLogger("canviz.sdo")

SDO_TIMEOUT_S     = 1.0      # per response, as CANopenNode's default client timeout
MAX_UPLOAD_BYTES  = 4096     # guard against a server that never sets the 'c' bit

ABORT_TOGGLE      = 0x05030000   # toggle bit not alternated
ABORT_TIMEOUT     = 0x05040000   # SDO protocol timed out
ABORT_INVALID_CS  = 0x05040001   # command specifier not valid or unknown
ABORT_OUT_OF_MEM  = 0x05040005   # out of memory


class SdoAbortError(Exception):
    """The transfer was aborted, by the server or by this client."""

    def __init__(self, code: int, segmented: bool = False, by_server: bool = True) -> None:
        self.code      = code
        self.segmented = segmented
        self.by_server = by_server
        who = "server" if by_server else "client"
        super().__init__(f"SDO abort 0x{code:08X} ({who})")


class SdoTimeoutError(Exception):
    """The node did not answer within SDO_TIMEOUT_S."""

    def __init__(self, node_id: int, segmented: bool = False) -> None:
        self.segmented = segmented
        super().__init__(f"No SDO response from node 0x{node_id:02X} within {SDO_TIMEOUT_S:.1f} s")


@dataclass
class SdoUploadResult:
    data: bytes
    segmented: bool


_node_locks: dict[int, asyncio.Lock] = {}


def _mux(index: int, subindex: int) -> list[int]:
    """Bytes 1-3 of an SDO frame: index (little-endian) + subindex."""
    return [index & 0xFF, (index >> 8) & 0xFF, subindex & 0xFF]


async def _send_abort(node_id: int, index: int, subindex: int, code: int) -> None:
    from canviz.bus import bus_manager
    try:
        await bus_manager.send(
            arbitration_id=0x600 + node_id,
            data=[0x80, *_mux(index, subindex), *code.to_bytes(4, "little")],
        )
    except Exception as exc:  # the transfer is already failing; just log
        log.warning("Could not send SDO abort to node 0x%02X: %s", node_id, exc)


async def sdo_upload(node_id: int, index: int, subindex: int = 0) -> SdoUploadResult:
    """
    Read one object from a node (expedited or segmented upload).

    Raises SdoAbortError, SdoTimeoutError, or RuntimeError when not connected.
    """
    from canviz.bus import bus_manager

    lock = _node_locks.setdefault(node_id, asyncio.Lock())
    async with lock:
        responses: asyncio.Queue[bytes] = asyncio.Queue()
        resp_cob_id = 0x580 + node_id

        def on_frame(msg) -> None:
            # Only this node's SDO responses; our own requests (0x600 + id) are echoed too
            if (msg.arbitration_id == resp_cob_id and not msg.is_extended_id
                    and not msg.is_remote_frame and len(msg.data) == 8):
                responses.put_nowait(bytes(msg.data))

        async def next_response(segmented: bool) -> bytes:
            try:
                return await asyncio.wait_for(responses.get(), SDO_TIMEOUT_S)
            except asyncio.TimeoutError:
                await _send_abort(node_id, index, subindex, ABORT_TIMEOUT)
                raise SdoTimeoutError(node_id, segmented) from None

        bus_manager.add_frame_callback(on_frame)
        try:
            await bus_manager.send(
                arbitration_id=0x600 + node_id,
                data=[0x40, *_mux(index, subindex), 0, 0, 0, 0],
            )

            # ── Initiate upload response ──────────────────────────────────
            while True:
                d = await next_response(segmented=False)
                if list(d[1:4]) != _mux(index, subindex):
                    continue   # a response to some other client's request
                if d[0] == 0x80:
                    raise SdoAbortError(int.from_bytes(d[4:8], "little"))
                if d[0] >> 5 != 2:
                    await _send_abort(node_id, index, subindex, ABORT_INVALID_CS)
                    raise SdoAbortError(ABORT_INVALID_CS, by_server=False)
                break

            cmd       = d[0]
            expedited = bool(cmd & 0x02)
            size_set  = bool(cmd & 0x01)
            if expedited:
                n = (cmd >> 2) & 0x03 if size_set else 0
                return SdoUploadResult(data=d[4:8 - n], segmented=False)

            size = int.from_bytes(d[4:8], "little") if size_set else None

            # ── Segment loop ──────────────────────────────────────────────
            buf    = bytearray()
            toggle = 0
            while True:
                await bus_manager.send(
                    arbitration_id=0x600 + node_id,
                    data=[0x60 | (toggle << 4), 0, 0, 0, 0, 0, 0, 0],
                )
                d   = await next_response(segmented=True)
                cmd = d[0]
                if cmd == 0x80:
                    raise SdoAbortError(int.from_bytes(d[4:8], "little"), segmented=True)
                if cmd >> 5 != 0:
                    await _send_abort(node_id, index, subindex, ABORT_INVALID_CS)
                    raise SdoAbortError(ABORT_INVALID_CS, segmented=True, by_server=False)
                if (cmd >> 4) & 0x01 != toggle:
                    await _send_abort(node_id, index, subindex, ABORT_TOGGLE)
                    raise SdoAbortError(ABORT_TOGGLE, segmented=True, by_server=False)

                unused = (cmd >> 1) & 0x07          # bytes of this segment without data
                buf.extend(d[1:8 - unused])
                if len(buf) > MAX_UPLOAD_BYTES:
                    await _send_abort(node_id, index, subindex, ABORT_OUT_OF_MEM)
                    raise SdoAbortError(ABORT_OUT_OF_MEM, segmented=True, by_server=False)
                if cmd & 0x01:                       # 'c': no more segments
                    break
                toggle ^= 1

            if size is not None and len(buf) != size:
                log.warning(
                    "SDO upload node 0x%02X 0x%04X:%d: indicated %d bytes, received %d",
                    node_id, index, subindex, size, len(buf),
                )
            return SdoUploadResult(data=bytes(buf), segmented=True)
        finally:
            bus_manager.remove_frame_callback(on_frame)


def printable_text(data: bytes) -> Optional[str]:
    """VISIBLE_STRING-looking payloads (printable ASCII, trailing NULs allowed) as text."""
    text = data.rstrip(b"\x00")
    if len(text) < 2 or not all(0x20 <= b < 0x7F for b in text):
        return None
    return text.decode("ascii")
