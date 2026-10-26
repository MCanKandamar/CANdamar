/**
 * sendFrameStore.ts
 * -----------------
 * The Send Frame list: frames sent once or on a timer. The list (without
 * the running state) is kept in localStorage, and can be saved to and loaded
 * from a JSON file so test sequences can be reused and shared.
 */

import { create } from 'zustand';
import { apiSendFrame } from '../api/client';

// Module-scope timer registry — never put intervals in Zustand state
const timers = new Map<string, ReturnType<typeof setInterval>>();

let counter = 0;
const uid = () => `f_${++counter}_${Date.now()}`;

export interface TransmitFrame {
  id:         string;   // internal key
  name:       string;   // optional label, e.g. "Enable operation"
  canId:      string;   // "0x123"
  dlc:        number;
  data:       string;   // "FF 00 3C ..."
  isExtended: boolean;
  isRemote:   boolean;  // RTR frame: no data, DLC = requested length
  intervalMs: number;   // 0 = manual only
  isRunning:  boolean;
  lastSent:   string | null;
  error:      string | null;
}

/** The parts of a frame that are saved (no running state or feedback). */
export type SavedFrame = Pick<TransmitFrame, 'name' | 'canId' | 'dlc' | 'data' | 'isExtended' | 'isRemote' | 'intervalMs'>;

function makeFrame(init: Partial<SavedFrame> = {}): TransmitFrame {
  return {
    id: uid(), name: '', canId: '0x123', dlc: 8,
    data: '00 00 00 00 00 00 00 00',
    isExtended: false, isRemote: false, intervalMs: 100,
    ...init,
    isRunning: false, lastSent: null, error: null,
  };
}

const STORAGE_KEY = 'canviz:sendFrames';
const FILE_FORMAT = 'candamar-send-list';

function toSaved(f: TransmitFrame): SavedFrame {
  const { name, canId, dlc, data, isExtended, isRemote, intervalMs } = f;
  return { name, canId, dlc, data, isExtended, isRemote, intervalMs };
}

/** Frames from a saved list, or null when it is not a valid list. */
function fromSaved(list: unknown): TransmitFrame[] | null {
  if (!Array.isArray(list)) return null;
  const frames: TransmitFrame[] = [];
  for (const raw of list) {
    const f = raw as Partial<SavedFrame>;
    if (typeof f?.canId !== 'string' || !Number.isInteger(f.dlc) || f.dlc! < 0 || f.dlc! > 8) return null;
    frames.push(makeFrame({
      name:       typeof f.name === 'string' ? f.name : '',
      canId:      f.canId,
      dlc:        f.dlc,
      data:       typeof f.data === 'string' ? f.data : '',
      isExtended: !!f.isExtended,
      isRemote:   !!f.isRemote,
      intervalMs: Number.isFinite(f.intervalMs) ? Math.max(0, f.intervalMs!) : 0,
    }));
  }
  return frames;
}

function loadFrames(): TransmitFrame[] {
  try {
    const frames = fromSaved(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'));
    if (frames && frames.length) return frames;
  } catch { /* ignore */ }
  return [makeFrame()];
}

function parseId(s: string): number | null {
  const v = parseInt(s.replace(/^0x/i, ''), 16);
  return isNaN(v) ? null : v;
}

function parseBytes(s: string): number[] | null {
  const cleaned = s.replace(/[,\s]+/g, ' ').trim();
  if (!cleaned) return [];
  const bytes: number[] = [];
  for (const p of cleaned.split(' ')) {
    const v = parseInt(p, 16);
    if (isNaN(v) || v < 0 || v > 255) return null;
    bytes.push(v);
  }
  return bytes;
}

async function doSend(f: TransmitFrame): Promise<string> {
  const id = parseId(f.canId);
  if (id === null) throw new Error('Invalid CAN ID');
  if (f.isRemote) {
    await apiSendFrame({ id, dlc: f.dlc, data: [], is_extended_id: f.isExtended, is_remote_frame: true });
    return `${f.isExtended ? '[EXT]' : '[STD]'} 0x${id.toString(16).toUpperCase()} [${f.dlc}] RTR`;
  }
  const data = parseBytes(f.data);
  if (data === null) throw new Error('Invalid data bytes');
  while (data.length < f.dlc) data.push(0);
  const trimmed = data.slice(0, f.dlc);
  await apiSendFrame({ id, dlc: f.dlc, data: trimmed, is_extended_id: f.isExtended });
  return (
    `${f.isExtended ? '[EXT]' : '[STD]'} 0x${id.toString(16).toUpperCase()}` +
    ` [${f.dlc}] ${trimmed.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}`
  );
}

interface SendFrameStore {
  frames:      TransmitFrame[];
  addFrame:    (init?: Partial<SavedFrame>) => void;
  removeFrame: (id: string) => void;
  updateFrame: (id: string, patch: Partial<TransmitFrame>) => void;
  sendOnce:    (id: string) => Promise<void>;
  toggleTimer: (id: string) => void;
  stopAll:     () => void;
  /** The list as JSON text for a file */
  exportList:  () => string;
  /** Replace the list with the frames of a saved file; returns an error text or null */
  importList:  (text: string) => string | null;
}

export const useSendFrameStore = create<SendFrameStore>((set, get) => ({
  frames: loadFrames(),

  addFrame: (init) => set((s) => ({ frames: [...s.frames, makeFrame(init)] })),

  removeFrame: (id) => {
    if (timers.has(id)) { clearInterval(timers.get(id)!); timers.delete(id); }
    set((s) => ({ frames: s.frames.filter((f) => f.id !== id) }));
  },

  updateFrame: (id, patch) =>
    set((s) => ({ frames: s.frames.map((f) => f.id === id ? { ...f, ...patch } : f) })),

  sendOnce: async (id) => {
    const frame = get().frames.find((f) => f.id === id);
    if (!frame) return;
    try {
      const lastSent = await doSend(frame);
      set((s) => ({ frames: s.frames.map((f) => f.id === id ? { ...f, lastSent, error: null } : f) }));
    } catch (e) {
      set((s) => ({ frames: s.frames.map((f) => f.id === id ? { ...f, error: (e as Error).message } : f) }));
    }
  },

  toggleTimer: (id) => {
    const frame = get().frames.find((f) => f.id === id);
    if (!frame) return;

    if (frame.isRunning) {
      if (timers.has(id)) { clearInterval(timers.get(id)!); timers.delete(id); }
      set((s) => ({ frames: s.frames.map((f) => f.id === id ? { ...f, isRunning: false } : f) }));
    } else {
      if (frame.intervalMs <= 0) return;
      const interval = setInterval(async () => {
        const current = get().frames.find((f) => f.id === id);
        if (!current) return;
        try {
          const lastSent = await doSend(current);
          set((s) => ({ frames: s.frames.map((f) => f.id === id ? { ...f, lastSent, error: null } : f) }));
        } catch (e) {
          set((s) => ({ frames: s.frames.map((f) => f.id === id ? { ...f, error: (e as Error).message } : f) }));
        }
      }, frame.intervalMs);
      timers.set(id, interval);
      set((s) => ({ frames: s.frames.map((f) => f.id === id ? { ...f, isRunning: true, error: null } : f) }));
    }
  },

  stopAll: () => {
    for (const timer of timers.values()) clearInterval(timer);
    timers.clear();
    set((s) => ({ frames: s.frames.map((f) => ({ ...f, isRunning: false })) }));
  },

  exportList: () =>
    JSON.stringify({ format: FILE_FORMAT, version: 1, frames: get().frames.map(toSaved) }, null, 2),

  importList: (text) => {
    let frames: TransmitFrame[] | null = null;
    try {
      const doc = JSON.parse(text);
      frames = fromSaved(Array.isArray(doc) ? doc : doc?.frames);
    } catch { /* not JSON */ }
    if (!frames) return 'Not a Send Frame list (JSON with a "frames" array)';
    get().stopAll();
    set({ frames: frames.length ? frames : [makeFrame()] });
    return null;
  },
}));

// Keep the list across reloads (only what is saved to files, never "running")
let savedJson = '';
useSendFrameStore.subscribe((s) => {
  const json = JSON.stringify(s.frames.map(toSaved));
  if (json === savedJson) return;
  savedJson = json;
  try { localStorage.setItem(STORAGE_KEY, json); } catch { /* ignore */ }
});