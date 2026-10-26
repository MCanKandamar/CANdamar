/**
 * frameViewStore.ts
 * -----------------
 * How the Frames tab shows the traffic: Monitor (one row per CAN ID, updated
 * in place) or Trace (every frame in time order), data bytes in hex or
 * decimal, and whether the display is paused. Pausing only freezes the
 * view -- frames are still received, counted, recorded and plotted.
 * View mode and radix persist to localStorage.
 */

import { create } from 'zustand';

export type FrameView = 'monitor' | 'trace';
export type Radix     = 'hex' | 'dec';

const STORAGE_KEY = 'canviz:frameView';
const RADIX_KEY   = 'canviz:frameRadix';

function load<T extends string>(key: string, alt: T, fallback: T): T {
  try {
    return localStorage.getItem(key) === alt ? alt : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

/** One data byte as shown: "0A" in hex, "10" (right-aligned to 3) in decimal. */
export function formatByte(b: number, radix: Radix): string {
  return radix === 'hex' ? b.toString(16).toUpperCase().padStart(2, '0') : String(b).padStart(3, ' ');
}

interface FrameViewStore {
  view:        FrameView;
  radix:       Radix;
  paused:      boolean;
  setView:     (view: FrameView) => void;
  setRadix:    (radix: Radix) => void;
  togglePause: () => void;
}

export const useFrameViewStore = create<FrameViewStore>((set) => ({
  view:   load<FrameView>(STORAGE_KEY, 'trace', 'monitor'),
  radix:  load<Radix>(RADIX_KEY, 'dec', 'hex'),
  paused: false,
  setView: (view) => {
    save(STORAGE_KEY, view);
    set({ view });
  },
  setRadix: (radix) => {
    save(RADIX_KEY, radix);
    set({ radix });
  },
  togglePause: () => set((s) => ({ paused: !s.paused })),
}));
