import { create } from 'zustand';
import type { CanFrame, FrameRow, FilterState } from '../types/can';
import { usePlotStore } from './plotStore';
import { addSignalValues, pdoMessageName, sdoMessageName } from './plotStore';
import { decodeCustomSignals } from './customSignalStore';

// Rolling window duration for rate calculation (ms)
const RATE_WINDOW_MS = 1000;

// Per-ID timestamp ring buffer for rate calculation
const rateBuckets = new Map<number, number[]>();

function calcRate(id: number, nowMs: number): number {
  const bucket = rateBuckets.get(id) ?? [];
  const cutoff = nowMs - RATE_WINDOW_MS;
  const trimmed = bucket.filter((t) => t > cutoff);
  trimmed.push(nowMs);
  rateBuckets.set(id, trimmed);
  return trimmed.length;
}

function toHex(id: number, extended: boolean): string {
  const digits = extended ? 8 : 3;
  return '0x' + id.toString(16).toUpperCase().padStart(digits, '0');
}

function dataToHex(data: number[]): string {
  return data.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

// ── Trace: time-ordered copy of the last TRACE_MAX frames ─────────────────────
// A ring buffer outside zustand, so appending stays cheap at high frame
// rates. The Trace view copies it out a few times a second.

export const TRACE_MAX = 10_000;

export type TraceRow = Omit<FrameRow, 'count' | 'rate' | 'lastSeen' | 'flashKey' | 'changedAt'> & {
  seq:    number;   // running frame number since the last clear
  timeMs: number;   // arrival time (Date.now())
};

const traceBuf: TraceRow[] = [];
let traceHead    = 0;     // next write position once the buffer is full
let traceSeq     = 0;
let traceStartMs = 0;

function pushTrace(row: TraceRow): void {
  if (traceBuf.length < TRACE_MAX) traceBuf.push(row);
  else {
    traceBuf[traceHead] = row;
    traceHead = (traceHead + 1) % TRACE_MAX;
  }
}

/** Sequence number of the newest traced frame (changes on every frame). */
export const traceVersion = () => traceSeq;

/** Arrival time of the first frame since the last clear (trace time zero). */
export const traceStart = () => traceStartMs;

/** The traced frames, oldest first. */
export function traceSnapshot(): TraceRow[] {
  return traceBuf.length < TRACE_MAX
    ? traceBuf.slice()
    : [...traceBuf.slice(traceHead), ...traceBuf.slice(0, traceHead)];
}

function clearTrace(): void {
  traceBuf.length = 0;
  traceHead = 0;
  traceSeq = 0;
  traceStartMs = 0;
}

// Parse filter input: supports "1A2", "0x1A2", "100-200", "0x100-0x1FF"
export function parseIdFilter(text: string): { min?: number; max?: number } {
  const t = text.trim();
  if (!t) return {};
  const rangeParts = t.split('-').map((p) => p.trim());
  if (rangeParts.length === 2) {
    const min = parseInt(rangeParts[0], 16);
    const max = parseInt(rangeParts[1], 16);
    if (!isNaN(min) && !isNaN(max)) return { min, max };
  }
  const single = parseInt(t.replace(/^0x/i, ''), 16);
  if (!isNaN(single)) return { min: single, max: single };
  return {};
}

interface FrameStore {
  frames: Map<number, FrameRow>;
  frameList: FrameRow[];
  totalFramesReceived: number;
  framesPerSecond: number;
  _fpsTicker: number[];
  filter: FilterState;

  ingestFrame: (frame: CanFrame) => void;
  clearFrames: () => void;
  setFilter: (patch: Partial<FilterState>) => void;
}

export const useFrameStore = create<FrameStore>((set, get) => ({
  frames: new Map(),
  frameList: [],
  totalFramesReceived: 0,
  framesPerSecond: 0,
  _fpsTicker: [],
  filter: {
    idText: '',
    signalName: '',
    showDecoded: true,
  },

  ingestFrame: (frame: CanFrame) => {
    const nowMs = Date.now();
    const store = get();

    const numericId = typeof frame.id === 'string'
      ? parseInt(frame.id, 16)
      : frame.id;

    const signals = frame.signals ?? frame.decoded_signals;

    // Overall fps
    const cutoff = nowMs - 1000;
    const fpsTicker = [...store._fpsTicker.filter((t) => t > cutoff), nowMs];
    const framesPerSecond = fpsTicker.length;

    const rate = calcRate(numericId, nowMs);

    const existing = store.frames.get(numericId);
    // Bytes that differ from the previous frame of this ID (Monitor highlight)
    const changedAt = frame.data.map((b, i) =>
      existing && existing.data[i] !== b ? nowMs : existing?.changedAt?.[i] ?? 0,
    );
    const updated: FrameRow = {
      id:             numericId,
      idHex:          toHex(numericId, frame.is_extended_id),
      dlc:            frame.dlc,
      data:           frame.data,
      dataHex:        dataToHex(frame.data),
      count:          (existing?.count ?? 0) + 1,
      rate,
      lastSeen:       nowMs,
      isExtended:     frame.is_extended_id,
      isRemote:       frame.is_remote_frame ?? false,
      isFd:           frame.is_fd,
      flashKey:       nowMs,
      changedAt,
      decodedSignals: signals,
      j1939:          frame.j1939,   // ← carry J1939 decode through to the table row
      canopen:        frame.canopen,   // ← carry CANopen decode through to the table row
    };

    if (traceSeq === 0) traceStartMs = nowMs;
    pushTrace({
      seq:            ++traceSeq,
      timeMs:         nowMs,
      id:             updated.id,
      idHex:          updated.idHex,
      dlc:            updated.dlc,
      data:           updated.data,
      dataHex:        updated.dataHex,
      isExtended:     updated.isExtended,
      isRemote:       updated.isRemote,
      isFd:           updated.isFd,
      decodedSignals: updated.decodedSignals,
      j1939:          updated.j1939,
      canopen:        updated.canopen,
    });

    if (signals?.length) {
      const tSec = nowMs / 1000;
      addSignalValues(signals, tSec);
    }

    // Feed CANopen PDO signals (EDS decoded) into the plot store.
    // Signals are shaped as {name, value, unit} from canopen_store._handle_pdo.
    // We synthesise message_name from node_id so the plot key matches other signals.
    if (frame.canopen?.pdo_signals?.length && frame.canopen.node_id != null) {
      const tSec = nowMs / 1000;
      const msgName = pdoMessageName(frame.canopen.node_id);
      const pdoSignals = frame.canopen.pdo_signals.map((sig) => ({
        name:         sig.name,
        message_name: msgName,
        value:        sig.value,
        unit:         sig.unit,
      }));
      addSignalValues(pdoSignals, tSec);
    }

    // Feed values of expedited SDO uploads seen on the bus (any SDO client)
    const sdo = frame.canopen?.sdo_transaction;
    if (sdo && !sdo.is_abort && sdo.response_cmd.startsWith('Upload Response (expedited')
        && sdo.value_int != null) {
      addSignalValues([{
        name:         sdo.object_name || `${sdo.index}:${sdo.subindex}`,
        message_name: sdoMessageName(sdo.node_id),
        value:        sdo.value ?? sdo.value_int,
      }], nowMs / 1000);
    }

    // Feed DBC-less custom signals (defined in the Plot tab) into the plot store
    const customSignals = decodeCustomSignals(numericId, frame.data);
    if (customSignals.length) {
      addSignalValues(customSignals, nowMs / 1000);
    }

    const frames = new Map(store.frames);
    frames.set(numericId, updated);

    const frameList = Array.from(frames.values()).sort((a, b) => a.id - b.id);
    const filteredList = applyFilter(frameList, store.filter);

    set({
      frames,
      frameList: filteredList,
      totalFramesReceived: store.totalFramesReceived + 1,
      framesPerSecond,
      _fpsTicker: fpsTicker,
    });
  },

  clearFrames: () => {
    rateBuckets.clear();
    clearTrace();
    usePlotStore.getState().clearBuffers();
    set({
      frames: new Map(),
      frameList: [],
      totalFramesReceived: 0,
      framesPerSecond: 0,
      _fpsTicker: [],
    });
  },

  setFilter: (patch) => {
    const store = get();
    const filter: FilterState = { ...store.filter, ...patch };
    const frameList = applyFilter(
      Array.from(store.frames.values()).sort((a, b) => a.id - b.id),
      filter,
    );
    set({ filter, frameList });
  },
}));

function applyFilter(rows: FrameRow[], filter: FilterState): FrameRow[] {
  let result = rows;

  if (filter.idText.trim()) {
    const { min, max } = parseIdFilter(filter.idText);
    if (min !== undefined && max !== undefined) {
      result = result.filter((r) => r.id >= min && r.id <= max);
    }
  }

  if (filter.signalName.trim()) {
    const q = filter.signalName.toLowerCase();
    result = result.filter((r) =>
      r.decodedSignals?.some(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.message_name.toLowerCase().includes(q),
      ),
    );
  }

  return result;
}
