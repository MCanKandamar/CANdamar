/**
 * densityStore.ts
 * ---------------
 * Display density: "comfortable" (default) or "compact" (shorter table rows,
 * less padding, so more frames fit on screen). Applied as
 * <html data-density="..."> for CSS, and read by the virtualised tables
 * for their row heights. Persists to localStorage.
 */

import { create } from 'zustand';

export type Density = 'comfortable' | 'compact';

const STORAGE_KEY = 'canviz:density';

function apply(density: Density): void {
  document.documentElement.setAttribute('data-density', density);
}

function load(): Density {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'compact' ? 'compact' : 'comfortable';
  } catch {
    return 'comfortable';
  }
}

interface DensityStore {
  density: Density;
  toggle:  () => void;
}

export const useDensityStore = create<DensityStore>((set, get) => ({
  density: load(),
  toggle: () => {
    const density: Density = get().density === 'compact' ? 'comfortable' : 'compact';
    try { localStorage.setItem(STORAGE_KEY, density); } catch { /* ignore */ }
    apply(density);
    set({ density });
  },
}));

// Apply the saved density before the first render
apply(useDensityStore.getState().density);
