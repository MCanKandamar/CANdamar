"""
canviz/routers/canopen.py
-------------------------
REST endpoints for the CANopen decoder.

GET  /canopen/status         -- mode, nodes, SDO log, EMCY log, NMT log
POST /canopen/mode           -- {"mode": "on"} | {"mode": "off"}
POST /canopen/reset          -- clear all node state
POST /canopen/eds            -- upload EDS file (multipart)
DELETE /canopen/eds          -- unload current EDS
GET  /canopen/eds/objects    -- list objects of the loaded EDS (?q= filter)
POST /canopen/sdo/read       -- read an object from a node (expedited or segmented upload)
POST /canopen/nmt            -- send an NMT command (with confirmation required by frontend)
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel

from canviz.canopen_store import canopen_store, eds_store

log = logging.getLogger("canviz.canopen.router")

router = APIRouter(prefix="/canopen", tags=["canopen"])


# ── Pydantic models ───────────────────────────────────────────────────────────

class ModeRequest(BaseModel):
    mode: str   # "on" | "off"


class SdoReadRequest(BaseModel):
    node_id: int      # 1-127
    index: int        # object dictionary index (e.g. 0x1008)
    subindex: int = 0
    quiet: bool = False   # periodic read (plot): keep it out of the SDO log


class NmtRequest(BaseModel):
    node_id: int    # 0 = broadcast, 1-127 = specific node
    command: int    # 0x01=Operational, 0x02=Stop, 0x80=Pre-op, 0x81=Reset, 0x82=ResetComm
    confirmed: bool = False   # frontend must send True after user confirms


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/status")
async def get_status():
    """Full CANopen decoder status: nodes, SDO log, EMCY events, NMT commands."""
    return canopen_store.full_status()


@router.post("/mode")
async def set_mode(req: ModeRequest):
    try:
        canopen_store.set_mode(req.mode)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"ok": True, "mode": canopen_store.mode}


@router.post("/reset")
async def reset():
    """Clear all accumulated node state, SDO log, EMCY log."""
    canopen_store.reset()
    return {"ok": True}


# ── EDS endpoints ─────────────────────────────────────────────────────────────

@router.post("/eds")
async def upload_eds(file: UploadFile = File(...)):
    """
    Upload an EDS file. Replaces any previously loaded EDS.
    Accepts .eds files (DCF files work too -- same format).
    """
    content = await file.read()
    result  = eds_store.load(content, file.filename or "unknown.eds")
    if not result["ok"]:
        raise HTTPException(status_code=422, detail=result["message"])
    return result


@router.delete("/eds")
async def clear_eds():
    """Unload the current EDS file."""
    eds_store.clear()
    return {"ok": True}


@router.get("/eds/objects")
async def list_eds_objects(q: str = ""):
    """
    List the objects of the loaded EDS (including manufacturer objects
    0x2000+), filtered by name or hex index. Each entry carries data_type
    and access so the UI can offer typed SDO reads and writes.
    """
    if not eds_store.loaded:
        raise HTTPException(status_code=404, detail="No EDS loaded")
    results = eds_store.list_objects(q)
    return {"filename": eds_store.filename, "results": results, "total": len(results)}


# ── SDO read (expedited or segmented upload) ──────────────────────────────────

async def _read_object(node_id: int, index: int, subindex: int, quiet: bool = False) -> dict:
    """
    Run one SDO upload and describe the outcome. Segmented results (and
    segmented aborts) are also written into the SDO log, which on its own
    only sees the initiate response. Quiet reads stay out of the log.
    """
    from canviz.sdo_client import SdoAbortError, SdoTimeoutError, printable_text, sdo_upload

    where = f"node 0x{node_id:02X}, index 0x{index:04X}:{subindex}"
    if quiet:
        canopen_store.quiet_sdo(node_id, index, subindex)
    try:
        result = await sdo_upload(node_id, index, subindex)
    except SdoAbortError as exc:
        if (exc.segmented or not exc.by_server) and not quiet:
            canopen_store.record_segmented_upload(node_id, index, subindex, abort_code=exc.code)
        return {
            "ok":         False,
            "abort_code": f"0x{exc.code:08X}",
            "detail":     f"SDO abort 0x{exc.code:08X} from {where}",
        }
    except SdoTimeoutError as exc:
        if exc.segmented and not quiet:
            canopen_store.record_segmented_upload(node_id, index, subindex, abort_code=0x05040000)
        return {"ok": False, "timeout": True, "detail": str(exc)}

    data = result.data
    if result.segmented and not quiet:
        canopen_store.record_segmented_upload(node_id, index, subindex, data=data)
    return {
        "ok":         True,
        "segmented":  result.segmented,
        "size":       len(data),
        "data_hex":   data.hex(" ").upper(),
        "value_int":  int.from_bytes(data, "little") if 0 < len(data) <= 8 else None,
        # Signed / float value from the EDS data type (None without EDS)
        "value":      eds_store.decode_value(index, subindex, data) if eds_store.loaded else None,
        "value_text": printable_text(data),
        "message":    f"Read {len(data)} byte(s) from {where}",
    }


@router.post("/sdo/read")
async def sdo_read(req: SdoReadRequest):
    """
    Read one object from a live node and return its value.

    Sends the SDO initiate-upload request (COB-ID 0x600 + node_id) and waits
    for the answer. Values over 4 bytes (e.g. 0x1008 device name) are read
    with a segmented upload. The transaction also appears in
    GET /canopen/status under recent_sdo.

    Response: {ok, data_hex, value_int, value, value_text, segmented, size},
    or {ok: false, abort_code, detail} when the node aborts the transfer.
    "value" is decoded with the EDS data type when an EDS is loaded. With
    "quiet": true the transfer is kept out of the SDO log (periodic reads).
    Requires an active CAN connection.
    """
    from canviz.bus import bus_manager

    if not bus_manager.connected:
        raise HTTPException(status_code=409, detail="Not connected to CAN bus")

    if not (1 <= req.node_id <= 127):
        raise HTTPException(status_code=400, detail="node_id must be 1-127")

    try:
        result = await _read_object(req.node_id, req.index, req.subindex, req.quiet)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Send error: {exc}")

    if result.get("timeout"):
        raise HTTPException(status_code=504, detail=result["detail"])
    return result


# ── NMT command ───────────────────────────────────────────────────────────────

_VALID_NMT_COMMANDS = {0x01, 0x02, 0x80, 0x81, 0x82}
_NMT_COMMAND_NAMES  = {
    0x01: "Start Node (Operational)",
    0x02: "Stop Node (Stopped)",
    0x80: "Enter Pre-Operational",
    0x81: "Reset Node (Application)",
    0x82: "Reset Communication",
}


@router.post("/nmt")
async def send_nmt(req: NmtRequest):
    """
    Send an NMT command frame.

    The frontend MUST send confirmed=True -- this prevents accidental NMT
    broadcasts from API calls that omit the field.

    NMT frame format: COB-ID 0x000, data=[cs, node_id]
    """
    if not req.confirmed:
        raise HTTPException(
            status_code=400,
            detail="confirmed must be true -- this prevents accidental NMT commands"
        )

    if req.command not in _VALID_NMT_COMMANDS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid NMT command 0x{req.command:02X}. "
                   f"Valid: {[hex(c) for c in sorted(_VALID_NMT_COMMANDS)]}"
        )

    from canviz.bus import bus_manager

    if not bus_manager.connected:
        raise HTTPException(status_code=409, detail="Not connected to CAN bus")

    try:
        await bus_manager.send(
            arbitration_id=0x000,
            data=[req.command, req.node_id & 0xFF],
            is_extended_id=False,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"NMT send error: {exc}")

    cmd_name = _NMT_COMMAND_NAMES.get(req.command, f"0x{req.command:02X}")
    target   = "all nodes" if req.node_id == 0 else f"node 0x{req.node_id:02X}"
    log.info("NMT sent: %s -> %s", cmd_name, target)

    return {
        "ok":      True,
        "message": f"NMT: {cmd_name} sent to {target}",
    }


# ── SDO write (expedited download) ────────────────────────────────────────────

class SdoWriteRequest(BaseModel):
    node_id:  int
    index:    int
    subindex: int = 0
    data:     list[int]   # raw bytes (1-4), user provides correct encoding
    confirmed: bool = False


@router.post("/sdo/write")
async def sdo_write(req: SdoWriteRequest):
    """
    Send an expedited SDO download (write) to a live node.

    The frontend MUST send confirmed=True to prevent accidental writes.
    data[] contains the raw byte values (little-endian, 1-4 bytes).
    The node's SDO download response will appear in GET /canopen/status
    under recent_sdo once it arrives and is decoded.

    CMD byte encoding per CiA 301 sec 7.2.4.3.3:
      0x23 = 4 bytes, 0x27 = 3 bytes, 0x2B = 2 bytes, 0x2F = 1 byte
    """
    if not req.confirmed:
        raise HTTPException(
            status_code=400,
            detail="confirmed must be true to prevent accidental SDO writes"
        )
    if not (1 <= req.node_id <= 127):
        raise HTTPException(status_code=400, detail="node_id must be 1-127")
    if not (1 <= len(req.data) <= 4):
        raise HTTPException(status_code=400, detail="data must be 1-4 bytes")

    from canviz.bus import bus_manager
    if not bus_manager.connected:
        raise HTTPException(status_code=409, detail="Not connected to CAN bus")

    size    = len(req.data)
    n       = 4 - size
    cmd     = 0x23 | (n << 2)
    padded  = list(req.data) + [0] * (4 - size)
    frame_data = [
        cmd,
        req.index & 0xFF,
        (req.index >> 8) & 0xFF,
        req.subindex & 0xFF,
    ] + padded[:4]

    try:
        await bus_manager.send(
            arbitration_id=0x600 + req.node_id,
            data=frame_data,
            is_extended_id=False,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Send error: {exc}")

    log.info(
        "SDO write sent to node 0x%02X index 0x%04X:%d data=%s",
        req.node_id, req.index, req.subindex, req.data,
    )
    return {
        "ok":      True,
        "message": f"SDO write sent to node 0x{req.node_id:02X}, "
                   f"index 0x{req.index:04X}:{req.subindex}, "
                   f"data={[hex(b) for b in req.data]}",
    }


# ── Object dictionary search ───────────────────────────────────────────────────

@router.get("/objects")
async def list_objects(q: str = ""):
    """
    Search the built-in CiA 301 + CiA 402 object dictionary.
    Returns up to 50 entries matching the query string (name or hex index).
    q is case-insensitive. Empty q returns the first 50 entries.
    """
    from canviz.canopen_store import _BUILTIN_OBJECTS

    q_lower = q.lower().strip()
    results = []
    for (index, sub), info in sorted(_BUILTIN_OBJECTS.items()):
        name        = info["name"]
        index_hex   = f"{index:04X}"
        index_hex_0x = f"0x{index_hex}"
        match = (
            not q_lower
            or q_lower in name.lower()
            or q_lower in index_hex.lower()
            or q_lower in index_hex_0x.lower()
        )
        if match:
            results.append({
                "index":    index_hex_0x,
                "subindex": sub,
                "name":     name,
                "unit":     info.get("unit", ""),
            })
        if len(results) >= 50:
            break

    return {"results": results, "total": len(results)}


# ── Node configuration export ─────────────────────────────────────────────────

class ExportRequest(BaseModel):
    node_ids: list[int] = []   # empty = all discovered nodes


# Standard objects to read per node during export
_EXPORT_OBJECTS: list[tuple[int, int, str]] = [
    (0x1008, 0, "Manufacturer Device Name"),
    (0x1018, 1, "Identity: Vendor ID"),
    (0x1018, 2, "Identity: Product Code"),
    (0x1018, 3, "Identity: Revision Number"),
    (0x1018, 4, "Identity: Serial Number"),
    (0x1009, 0, "Manufacturer Hardware Version"),
    (0x100A, 0, "Manufacturer Software Version"),
    (0x6041, 0, "Statusword"),
    (0x6061, 0, "Modes of Operation Display"),
    (0x6064, 0, "Position Actual Value"),
    (0x606C, 0, "Velocity Actual Value"),
    (0x6081, 0, "Profile Velocity"),
    (0x6083, 0, "Profile Acceleration"),
    (0x6084, 0, "Profile Deceleration"),
    (0x1017, 0, "Producer Heartbeat Time"),
]


@router.post("/export")
async def export_node_config(req: ExportRequest):
    """
    Export node configuration by reading standard SDO objects from all
    discovered nodes, one read at a time.

    Returns every read with its outcome (value or abort code) under
    "results"; the values also appear in GET /canopen/status recent_sdo.

    Requires an active CAN connection. Node IDs are those discovered via
    heartbeat frames. A node that does not answer within the SDO timeout
    is skipped after its first unanswered read.
    """
    from canviz.bus import bus_manager

    if not bus_manager.connected:
        raise HTTPException(status_code=409, detail="Not connected to CAN bus")

    status    = canopen_store.full_status()
    all_nodes = [n["node_id"] for n in status.get("nodes", [])]

    targets = req.node_ids if req.node_ids else all_nodes
    if not targets:
        raise HTTPException(
            status_code=404,
            detail="No nodes discovered yet. Enable the decoder and wait for heartbeat frames."
        )

    reads_sent: list[dict] = []

    # Reads run one after another: a node serves one SDO transfer at a time,
    # and waiting for each answer also completes segmented values (0x1008...).
    for node_id in targets:
        for index, subindex, name in _EXPORT_OBJECTS:
            try:
                result = await _read_object(node_id, index, subindex)
            except Exception as exc:
                log.warning("Export SDO read failed node=0x%02X 0x%04X: %s", node_id, index, exc)
                continue
            reads_sent.append({
                "node_id":  node_id,
                "index":    f"0x{index:04X}",
                "subindex": subindex,
                "name":     name,
                **result,
            })
            if result.get("timeout"):
                # Node is not answering -- skip its remaining objects
                log.warning("Export: node 0x%02X did not answer, skipping it", node_id)
                break

    answered = sum(1 for r in reads_sent if r.get("ok"))
    return {
        "ok":        True,
        "nodes":     targets,
        "reads_sent": len(reads_sent),
        "answered":  answered,
        "results":   reads_sent,
        "message":   f"Read {answered} of {len(reads_sent)} objects across {len(targets)} node(s). "
                     f"Values are in the SDO log.",
    }
