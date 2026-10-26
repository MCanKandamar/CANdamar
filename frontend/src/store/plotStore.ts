import { create } from 'zustand';
import { CUSTOM_MESSAGE_NAME } from './customSignalStore';

export const SIGNAL_COLORS = [
  '#22c55e',  // green
  '#3b82f6',  // blue
  '#f59e0b',  // amber
  '#ec4899',  // pink
  '#8b5cf6',  // purple
  '#06b6d4',  // cyan
  '#ef4444',  // red
  '#f97316',  // orange
];

export const MAX_SIGNALS    = 8;
export const DISPLAY_POINTS = 2_000;

// ─── Signal sources ──────────────────────────────────────────────────────────
// A plot key is "<message>.<signal>". The message part tells where the value
// came from: a DBC message name, "CANopen 0x0D" (EDS-decoded PDO),
// "SDO 0x0D" (SDO upload) or "Custom" (DBC-less raw bytes).

export type SignalSource = 'dbc' | 'pdo' | 'sdo' | 'custom';

const nodeHex = (nodeId: number) => `0x${nodeId.toString(16).toUpperCase().padStart(2, '0')}`;

export const pdoMessageName = (nodeId: number) => `CANopen ${nodeHex(nodeId)}`;
export const sdoMessageName = (nodeId: number) => `SDO ${nodeHex(nodeId)}`;

export function signalSource(key: string): SignalSource {
  if (key.startsWith(`${CUSTOM_MESSAGE_NAME}.`)) return 'custom';
  if (/^CANopen 0x[0-9A-F]{2}\./.test(key)) return 'pdo';
  if (/^SDO 0x[0-9A-F]{2}\./.test(key)) return 'sdo';
  return 'dbc';
}

// ─── Ring buffers - module scope, never in Zustand ───────────────────────────

const MAX_POINTS = 36_000;

interface RingBuffer {
  ts:    Float64Array;
  vs:    Float32Array;
  head:  number;
  count: number;
}

const ringBuffers = new Map<string, RingBuffer>();

function createRingBuffer(): RingBuffer {
  return { ts: new Float64Array(MAX_POINTS), vs: new Float32Array(MAX_POINTS), head: 0, count: 0 };
}

function writePoint(buf: RingBuffer, t: number, v: number): void {
  buf.ts[buf.head] = t;
  buf.vs[buf.head] = v;
  buf.head = (buf.head + 1) % MAX_POINTS;
  if (buf.count < MAX_POINTS) buf.count++;
}

export function readBuffer(buf: RingBuffer): [Float64Array, Float32Array] {
  const n = buf.count;
  if (n === 0) return [new Float64Array(0), new Float32Array(0)];
  if (n < MAX_POINTS) return [buf.ts.subarray(0, n), buf.vs.subarray(0, n)];
  const ts = new Float64Array(MAX_POINTS);
  const vs = new Float32Array(MAX_POINTS);
  const tail = MAX_POINTS - buf.head;
  ts.set(buf.ts.subarray(buf.head), 0); ts.set(buf.ts.subarray(0, buf.head), tail);
  vs.set(buf.vs.subarray(buf.head), 0); vs.set(buf.vs.subarray(0, buf.head), tail);
  return [ts, vs];
}

// ─── Public write API (called from frameStore) ────────────────────────────────

export function addSignalValues(
  signals: Array<{ name: string; message_name: string; value: unknown; unit?: string }>,
  timestampSec: number,
): void {
  const newKeys: string[] = [];
  const newUnits: Record<string, string> = {};
  for (const sig of signals) {
    const v = Number(sig.value);
    if (!Number.isFinite(v)) continue;
    const key = `${sig.message_name}.${sig.name}`;
    if (!ringBuffers.has(key)) {
      ringBuffers.set(key, createRingBuffer());
      newKeys.push(key);
      if (sig.unit) newUnits[key] = sig.unit;
    }
    writePoint(ringBuffers.get(key)!, timestampSec, v);
  }
  if (newKeys.length > 0) {
    usePlotStore.setState((s) => ({
      availableSignals: [...s.availableSignals, ...newKeys],
      signalUnits:      { ...s.signalUnits, ...newUnits },
    }));
  }
}

export function getSignalBuffer(key: string) {
  return ringBuffers.get(key);
}

// Returns the most recent timestamp across all selected signals
export function getLatestTimestamp(keys: string[]): number {
  let latest = 0;
  for (const key of keys) {
    const buf = ringBuffers.get(key);
    if (!buf || buf.count === 0) continue;
    // Most recent write is one behind head in the ring
    const lastIdx = (buf.head - 1 + MAX_POINTS) % MAX_POINTS;
    if (buf.ts[lastIdx] > latest) latest = buf.ts[lastIdx];
  }
  return latest;
}

/** Latest value of `key` as displayed, i.e. with the signal's scale applied. */
export function getLatestValue(key: string): number | null {
  const buf = ringBuffers.get(key);
  if (!buf || buf.count === 0) return null;
  const lastIdx = (buf.head - 1 + MAX_POINTS) % MAX_POINTS;
  return buf.vs[lastIdx] * getSignalScale(key);
}

// ─── Display scale / unit per signal ──────────────────────────────────────────
// The ring buffers keep the values as received; the scale is applied when
// drawing, so changing it also rescales the history.

export interface SignalScale {
  scale: number;
  unit:  string;
}

const SCALES_KEY = 'canviz:signalScales';

function loadScales(): Record<string, SignalScale> {
  try {
    const raw = JSON.parse(localStorage.getItem(SCALES_KEY) ?? '{}');
    const out: Record<string, SignalScale> = {};
    if (raw && typeof raw === 'object') {
      for (const [key, v] of Object.entries(raw as Record<string, Partial<SignalScale>>)) {
        if (v && Number.isFinite(v.scale) && v.scale !== 0 && typeof v.unit === 'string') {
          out[key] = { scale: v.scale!, unit: v.unit };
        }
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function getSignalScale(key: string): number {
  return usePlotStore.getState().signalScales[key]?.scale ?? 1;
}

/** Unit to show: the user's override, else the unit reported by the source. */
export function displayUnit(
  key: string,
  scales: Record<string, SignalScale>,
  units: Record<string, string>,
): string {
  return scales[key]?.unit ?? units[key] ?? '';
}

/** Signals measured in millivolts (by unit or name), e.g. EDS object "Vdc mV". */
export function isMillivolt(key: string, unit: string): boolean {
  return unit === 'mV' || /mV$/.test(key.trim());
}

// ─── Zustand - UI state only ──────────────────────────────────────────────────

interface PlotStore {
  selectedSignals:  string[];
  availableSignals: string[];
  /** Unit reported by the source (DBC, EDS), by plot key */
  signalUnits:      Record<string, string>;
  /** Display scale and unit set by the user, by plot key (persisted) */
  signalScales:     Record<string, SignalScale>;
  windowSec:        number;
  setSignalScale:   (key: string, scale: SignalScale | null) => void;
  toggleSignal:     (key: string) => void;
  setWindowSec:     (s: number) => void;
  clearBuffers:     () => void;
  /** Drop one signal completely: its buffer, selection and selector entry. */
  forgetSignal:     (key: string) => void;
}

export const usePlotStore = create<PlotStore>((set, get) => ({
  selectedSignals:  [],
  availableSignals: [],
  signalUnits:      {},
  signalScales:     loadScales(),
  windowSec:        60,

  setSignalScale: (key, scale) => {
    const signalScales = { ...get().signalScales };
    if (scale) signalScales[key] = scale;
    else delete signalScales[key];
    set({ signalScales });
    try { localStorage.setItem(SCALES_KEY, JSON.stringify(signalScales)); } catch { /* ignore */ }
  },

  toggleSignal: (key) => {
    const { selectedSignals } = get();
    if (selectedSignals.includes(key)) {
      set({ selectedSignals: selectedSignals.filter((k) => k !== key) });
    } else if (selectedSignals.length < MAX_SIGNALS) {
      set({ selectedSignals: [...selectedSignals, key] });
    }
  },

  setWindowSec: (windowSec) => set({ windowSec }),

  clearBuffers: () => {
    ringBuffers.clear();
    set({ selectedSignals: [], availableSignals: [], signalUnits: {} });
  },

  forgetSignal: (key) => {
    ringBuffers.delete(key);
    set((s) => ({
      selectedSignals:  s.selectedSignals.filter((k) => k !== key),
      availableSignals: s.availableSignals.filter((k) => k !== key),
    }));
  },
}));