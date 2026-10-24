/**
 * customSignalStore.ts
 * --------------------
 * DBC-less signals for the plot: the user picks a CAN ID, a byte position,
 * a type, the byte order and a scale/offset, and every matching frame is
 * decoded on the fly. Definitions persist to localStorage.
 *
 * Decoded values reach the plot through addSignalValues() with the message
 * name "Custom", so a signal named "speed" is plotted as "Custom.speed".
 */

import { create } from 'zustand';

export type CustomSignalType = 'u8' | 'i8' | 'u16' | 'i16' | 'u32' | 'i32' | 'f32';

export const CUSTOM_SIGNAL_TYPES: { id: CustomSignalType; label: string; size: number }[] = [
  { id: 'u8',  label: 'uint8',   size: 1 },
  { id: 'i8',  label: 'int8',    size: 1 },
  { id: 'u16', label: 'uint16',  size: 2 },
  { id: 'i16', label: 'int16',   size: 2 },
  { id: 'u32', label: 'uint32',  size: 4 },
  { id: 'i32', label: 'int32',   size: 4 },
  { id: 'f32', label: 'float32', size: 4 },
];

export const CUSTOM_MESSAGE_NAME = 'Custom';

export interface CustomSignal {
  name:         string;    // unique; plot key is "Custom.<name>"
  id:           number;    // CAN arbitration ID
  startByte:    number;    // first data byte, 0-7
  type:         CustomSignalType;
  littleEndian: boolean;   // true = Intel (LSB first), false = Motorola (MSB first)
  scale:        number;
  offset:       number;
}

export const customSignalKey = (name: string) => `${CUSTOM_MESSAGE_NAME}.${name}`;

export const typeSize = (type: CustomSignalType) =>
  CUSTOM_SIGNAL_TYPES.find((t) => t.id === type)!.size;

/** Physical value of `sig` in `data`, or null when the frame is too short. */
export function decodeCustomSignal(sig: CustomSignal, data: number[]): number | null {
  const size = typeSize(sig.type);
  if (sig.startByte + size > data.length) return null;
  const view = new DataView(Uint8Array.from(data.slice(sig.startByte, sig.startByte + size)).buffer);
  const le = sig.littleEndian;
  let raw: number;
  switch (sig.type) {
    case 'u8':  raw = view.getUint8(0); break;
    case 'i8':  raw = view.getInt8(0); break;
    case 'u16': raw = view.getUint16(0, le); break;
    case 'i16': raw = view.getInt16(0, le); break;
    case 'u32': raw = view.getUint32(0, le); break;
    case 'i32': raw = view.getInt32(0, le); break;
    case 'f32': raw = view.getFloat32(0, le); break;
  }
  return raw * sig.scale + sig.offset;
}

// ── Persistence ──────────────────────────────────────────────────────────────

const STORAGE_KEY = 'canviz:customSignals';

function isValid(s: Partial<CustomSignal>): s is CustomSignal {
  return typeof s.name === 'string' && s.name.length > 0
    && Number.isInteger(s.id) && Number.isInteger(s.startByte)
    && CUSTOM_SIGNAL_TYPES.some((t) => t.id === s.type)
    && typeof s.littleEndian === 'boolean'
    && Number.isFinite(s.scale) && Number.isFinite(s.offset);
}

function loadSignals(): CustomSignal[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) return list.filter(isValid);
    }
  } catch { /* ignore */ }
  return [];
}

// ── Store ────────────────────────────────────────────────────────────────────

interface CustomSignalStore {
  signals: CustomSignal[];
  /** Add a signal, replacing any existing one with the same name. */
  add:     (sig: CustomSignal) => void;
  remove:  (name: string) => void;
}

export const useCustomSignalStore = create<CustomSignalStore>((set) => ({
  signals: loadSignals(),
  add:    (sig) => set((s) => ({ signals: [...s.signals.filter((x) => x.name !== sig.name), sig] })),
  remove: (name) => set((s) => ({ signals: s.signals.filter((x) => x.name !== name) })),
}));

// Index by CAN ID so the per-frame lookup in frameStore stays O(1)
let byId = new Map<number, CustomSignal[]>();

function rebuildIndex(signals: CustomSignal[]): void {
  byId = new Map();
  for (const sig of signals) {
    const list = byId.get(sig.id) ?? [];
    list.push(sig);
    byId.set(sig.id, list);
  }
}
rebuildIndex(useCustomSignalStore.getState().signals);

useCustomSignalStore.subscribe((s) => {
  rebuildIndex(s.signals);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s.signals)); } catch { /* ignore */ }
});

/** Decode every custom signal defined for `id`; called once per received frame. */
export function decodeCustomSignals(
  id: number,
  data: number[],
): Array<{ name: string; message_name: string; value: number }> {
  const sigs = byId.get(id);
  if (!sigs) return [];
  const out: Array<{ name: string; message_name: string; value: number }> = [];
  for (const sig of sigs) {
    const value = decodeCustomSignal(sig, data);
    if (value !== null) out.push({ name: sig.name, message_name: CUSTOM_MESSAGE_NAME, value });
  }
  return out;
}
