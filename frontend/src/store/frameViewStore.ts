/**
 * frameViewStore.ts
 * -----------------
 * How the Frames tab shows the traffic: Monitor (one row per CAN ID, updated
 * in place) or Trace (every frame in time order), and whether the display
 * is paused. Pausing only freezes the view -- frames are still received,
 * counted, recorded and plotted. The view mode persists to localStorage.
 */

import { create } from 'zustand';

export type FrameView = 'monitor' | 'trace';

const STORAGE_KEY = 'canviz:frameView';

function loadView(): FrameView {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'trace' ? 'trace' : 'monitor';
  } catch {
    return 'monitor';
  }
}

interface FrameViewStore {
  view:        FrameView;
  paused:      boolean;
  setView:     (view: FrameView) => void;
  togglePause: () => void;
}

export const useFrameViewStore = create<FrameViewStore>((set) => ({
  view:   loadView(),
  paused: false,
  setView: (view) => {
    try { localStorage.setItem(STORAGE_KEY, view); } catch { /* ignore */ }
    set({ view });
  },
  togglePause: () => set((s) => ({ paused: !s.paused })),
}));
