/**
 * layoutStore.ts
 * --------------
 * UI layout state for the app shell (sidebar visibility).
 * Persists to localStorage so the layout survives a reload.
 *
 * Usage:
 *   const sidebarOpen   = useLayoutStore((s) => s.sidebarOpen);
 *   const toggleSidebar = useLayoutStore((s) => s.toggleSidebar);
 */

import { create } from 'zustand';

const STORAGE_KEY = 'canviz:layout';

interface PersistedLayout {
  sidebarOpen: boolean;
}

const DEFAULTS: PersistedLayout = {
  sidebarOpen: true,
};

function loadLayout(): PersistedLayout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<PersistedLayout>;
      return {
        sidebarOpen: typeof saved.sidebarOpen === 'boolean' ? saved.sidebarOpen : DEFAULTS.sidebarOpen,
      };
    }
  } catch { /* ignore */ }
  return DEFAULTS;
}

interface LayoutStore extends PersistedLayout {
  toggleSidebar: () => void;
}

export const useLayoutStore = create<LayoutStore>((set) => ({
  ...loadLayout(),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}));

// Write-through persistence -- every layout change is saved immediately
useLayoutStore.subscribe((s) => {
  const snapshot: PersistedLayout = {
    sidebarOpen: s.sidebarOpen,
  };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)); } catch { /* ignore */ }
});
