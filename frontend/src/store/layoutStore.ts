/**
 * layoutStore.ts
 * --------------
 * UI layout state for the app shell: sidebar visibility, bottom pane mode
 * and the Chrome-style tabs. There are three panes -- main, right and
 * bottom -- and each has its own ordered tab list and active tab. Every tab,
 * the tools (Send Frame, Record, Replay) included, lives in exactly one pane
 * and can move to any other; the right and bottom panes exist only while
 * they hold tabs. The main pane is never emptied.
 * Persists to localStorage so the layout survives a reload.
 *
 * Usage:
 *   const sidebarOpen   = useLayoutStore((s) => s.sidebarOpen);
 *   const toggleSidebar = useLayoutStore((s) => s.toggleSidebar);
 */

import { create } from 'zustand';

export type TabId  = 'frames' | 'canopen' | 'j1939' | 'plot' | 'send' | 'record' | 'replay';
export type PaneId = 'main' | 'right' | 'bottom';
export type BottomMode = 'normal' | 'collapsed' | 'maximized';

export const TABS: { id: TabId; label: string }[] = [
  { id: 'frames',  label: 'Frames' },
  { id: 'canopen', label: 'CANopen' },
  { id: 'j1939',   label: 'J1939' },
  { id: 'plot',    label: 'Plot' },
  { id: 'send',    label: 'Send Frame' },
  { id: 'record',  label: 'Record' },
  { id: 'replay',  label: 'Replay' },
];

export const PANES: PaneId[] = ['main', 'right', 'bottom'];

const TAB_IDS = TABS.map((t) => t.id);

/** Tools that start in the bottom pane */
const TOOL_TABS: TabId[] = ['send', 'record', 'replay'];

export const tabLabel = (tab: TabId) => TABS.find((t) => t.id === tab)?.label ?? tab;

export const MIN_SPLIT_RATIO = 0.2;
export const MAX_SPLIT_RATIO = 0.8;

const STORAGE_KEY     = 'canviz:layout2';
const OLD_STORAGE_KEY = 'canviz:layout';     // layout before per-pane tabs (0.4.0)

interface PersistedLayout {
  sidebarOpen: boolean;
  bottomMode:  BottomMode;
  panes:       Record<PaneId, TabId[]>;
  active:      Record<PaneId, TabId | null>;
  focusedPane: PaneId;
  splitRatio:  number;   // width of the main pane as a fraction of main + right
}

const DEFAULTS: PersistedLayout = {
  sidebarOpen: true,
  bottomMode:  'normal',
  panes:       { main: ['frames', 'canopen', 'j1939', 'plot'], right: [], bottom: ['send', 'record', 'replay'] },
  active:      { main: 'frames', right: null, bottom: 'send' },
  focusedPane: 'main',
  splitRatio:  0.5,
};

const isTab = (v: unknown): v is TabId => TAB_IDS.includes(v as TabId);

function clampRatio(r: number): number {
  return Math.min(MAX_SPLIT_RATIO, Math.max(MIN_SPLIT_RATIO, r));
}

/** Every tab in exactly one pane, main never empty, active tabs valid. */
function normalise(panes: Record<PaneId, TabId[]>, active: Partial<Record<PaneId, unknown>>) {
  const seen = new Set<TabId>();
  const out  = { main: [], right: [], bottom: [] } as Record<PaneId, TabId[]>;
  for (const pane of PANES) {
    for (const tab of panes[pane] ?? []) {
      if (!isTab(tab) || seen.has(tab)) continue;
      out[pane].push(tab);
      seen.add(tab);
    }
  }
  for (const tab of TAB_IDS) {
    if (!seen.has(tab)) out[TOOL_TABS.includes(tab) ? 'bottom' : 'main'].push(tab);
  }
  if (out.main.length === 0) {
    out.main  = [...out.right, ...out.bottom];
    out.right = [];
    out.bottom = [];
  }
  const act = {} as Record<PaneId, TabId | null>;
  for (const pane of PANES) {
    const a = active[pane];
    act[pane] = isTab(a) && out[pane].includes(a) ? a : out[pane][0] ?? null;
  }
  return { panes: out, active: act };
}

// Validate everything read back from localStorage -- an older or hand-edited
// entry must never leave the workspace without a valid tab.
function loadLayout(): PersistedLayout {
  try {
    const bottomModes: BottomMode[] = ['normal', 'collapsed', 'maximized'];
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<PersistedLayout>;
      const { panes, active } = normalise(
        (saved.panes ?? DEFAULTS.panes) as Record<PaneId, TabId[]>,
        saved.active ?? {},
      );
      return {
        sidebarOpen: typeof saved.sidebarOpen === 'boolean' ? saved.sidebarOpen : DEFAULTS.sidebarOpen,
        bottomMode:  bottomModes.includes(saved.bottomMode as BottomMode)
          ? saved.bottomMode as BottomMode : DEFAULTS.bottomMode,
        panes,
        active,
        focusedPane: PANES.includes(saved.focusedPane as PaneId) && panes[saved.focusedPane as PaneId].length
          ? saved.focusedPane as PaneId : 'main',
        splitRatio:  typeof saved.splitRatio === 'number' ? clampRatio(saved.splitRatio) : DEFAULTS.splitRatio,
      };
    }

    // 0.4.0 layout: one tab order, optional split with one tab on the right
    const old = JSON.parse(localStorage.getItem(OLD_STORAGE_KEY) ?? 'null');
    if (old && typeof old === 'object') {
      const order: TabId[] = Array.isArray(old.tabOrder) ? old.tabOrder.filter(isTab) : [];
      const right = old.split && isTab(old.activeTab?.right) ? [old.activeTab.right as TabId] : [];
      const { panes, active } = normalise(
        { main: order.filter((t) => !right.includes(t)), right, bottom: DEFAULTS.panes.bottom },
        { main: old.activeTab?.left, right: right[0] },
      );
      return {
        ...DEFAULTS,
        sidebarOpen: typeof old.sidebarOpen === 'boolean' ? old.sidebarOpen : DEFAULTS.sidebarOpen,
        bottomMode:  bottomModes.includes(old.bottomMode) ? old.bottomMode : DEFAULTS.bottomMode,
        panes,
        active,
        splitRatio:  typeof old.splitRatio === 'number' ? clampRatio(old.splitRatio) : DEFAULTS.splitRatio,
      };
    }
  } catch { /* ignore */ }
  return DEFAULTS;
}

/** Pane that holds `tab` */
export function paneOf(panes: Record<PaneId, TabId[]>, tab: TabId): PaneId {
  return PANES.find((p) => panes[p].includes(tab)) ?? 'main';
}

interface LayoutStore extends PersistedLayout {
  /** Tab being dragged (not persisted) -- shows the drop zones */
  draggingTab: TabId | null;

  toggleSidebar:  () => void;
  setBottomMode:  (mode: BottomMode) => void;
  selectTab:      (pane: PaneId, tab: TabId) => void;
  /**
   * Move `tab` into `pane`, in front of `before` (or at the end when null),
   * and show it there. A pane left empty closes; main is never emptied.
   */
  moveTab:        (tab: TabId, pane: PaneId, before: TabId | null) => void;
  /** Open the right pane with the main pane's next tab. */
  openSplit:      () => void;
  /** Close the right or bottom pane; its tabs go back to the main pane. */
  closePane:      (pane: PaneId) => void;
  focusPane:      (pane: PaneId) => void;
  setSplitRatio:  (ratio: number) => void;
  setDraggingTab: (tab: TabId | null) => void;
}

export const useLayoutStore = create<LayoutStore>((set, get) => ({
  ...loadLayout(),
  draggingTab: null,

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  setBottomMode: (mode) => set({ bottomMode: mode }),

  selectTab: (pane, tab) => {
    const { active } = get();
    set({ active: { ...active, [pane]: tab }, focusedPane: pane });
  },

  moveTab: (tab, pane, before) => {
    if (tab === before) return;
    const { panes, active } = get();
    const from = paneOf(panes, tab);
    if (from === 'main' && pane !== 'main' && panes.main.length === 1) return;

    const next = { ...panes, [from]: panes[from].filter((t) => t !== tab) };
    const list = [...next[pane]];
    const at   = before === null ? -1 : list.indexOf(before);
    list.splice(at < 0 ? list.length : at, 0, tab);
    next[pane] = list;

    const nextActive = { ...active, [pane]: tab };
    if (from !== pane && active[from] === tab) {
      // Show the neighbour of the tab that left
      const i = panes[from].indexOf(tab);
      nextActive[from] = next[from][Math.min(i, next[from].length - 1)] ?? null;
    }
    set({ panes: next, active: nextActive, focusedPane: pane });
  },

  openSplit: () => {
    const { panes, active } = get();
    if (panes.right.length > 0 || panes.main.length < 2) return;
    const i   = panes.main.indexOf(active.main ?? panes.main[0]);
    const tab = panes.main[(i + 1) % panes.main.length];
    get().moveTab(tab, 'right', null);
  },

  closePane: (pane) => {
    if (pane === 'main') return;
    const { panes, active } = get();
    set({
      panes:       { ...panes, main: [...panes.main, ...panes[pane]], [pane]: [] },
      active:      { ...active, [pane]: null },
      focusedPane: 'main',
    });
  },

  focusPane: (pane) => {
    if (get().focusedPane !== pane) set({ focusedPane: pane });
  },

  setSplitRatio: (ratio) => set({ splitRatio: clampRatio(ratio) }),

  setDraggingTab: (tab) => set({ draggingTab: tab }),
}));

// Write-through persistence -- every layout change is saved immediately
useLayoutStore.subscribe((s) => {
  const snapshot: PersistedLayout = {
    sidebarOpen: s.sidebarOpen,
    bottomMode:  s.bottomMode,
    panes:       s.panes,
    active:      s.active,
    focusedPane: s.focusedPane,
    splitRatio:  s.splitRatio,
  };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)); } catch { /* ignore */ }
});
