/**
 * layoutStore.ts
 * --------------
 * UI layout state for the app shell: sidebar visibility and the
 * Chrome-style tab workspace (tab order, split view, active tab per pane).
 * Persists to localStorage so the layout survives a reload.
 *
 * Usage:
 *   const sidebarOpen   = useLayoutStore((s) => s.sidebarOpen);
 *   const toggleSidebar = useLayoutStore((s) => s.toggleSidebar);
 */

import { create } from 'zustand';

export type WorkspaceTab = 'frames' | 'canopen' | 'j1939' | 'plot';
export type Pane = 'left' | 'right';

export const WORKSPACE_TABS: { id: WorkspaceTab; label: string }[] = [
  { id: 'frames',  label: 'Frames' },
  { id: 'canopen', label: 'CANopen' },
  { id: 'j1939',   label: 'J1939' },
  { id: 'plot',    label: 'Plot' },
];

const TAB_IDS = WORKSPACE_TABS.map((t) => t.id);

export const MIN_SPLIT_RATIO = 0.2;
export const MAX_SPLIT_RATIO = 0.8;

const STORAGE_KEY = 'canviz:layout';

interface PersistedLayout {
  sidebarOpen: boolean;
  tabOrder:    WorkspaceTab[];
  split:       boolean;
  activeTab:   Record<Pane, WorkspaceTab>;
  focusedPane: Pane;
  splitRatio:  number;   // width of the left pane as a fraction of the workspace
}

const DEFAULTS: PersistedLayout = {
  sidebarOpen: true,
  tabOrder:    TAB_IDS,
  split:       false,
  activeTab:   { left: 'frames', right: 'canopen' },
  focusedPane: 'left',
  splitRatio:  0.5,
};

const isTab = (v: unknown): v is WorkspaceTab => TAB_IDS.includes(v as WorkspaceTab);

function clampRatio(r: number): number {
  return Math.min(MAX_SPLIT_RATIO, Math.max(MIN_SPLIT_RATIO, r));
}

// Validate everything read back from localStorage -- an older or hand-edited
// entry must never leave the workspace without a valid tab.
function loadLayout(): PersistedLayout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const saved = JSON.parse(raw) as Partial<PersistedLayout>;

    const savedOrder = Array.isArray(saved.tabOrder) ? saved.tabOrder.filter(isTab) : [];
    const tabOrder   = [...new Set([...savedOrder, ...TAB_IDS])];

    const left  = isTab(saved.activeTab?.left)  ? saved.activeTab.left  : DEFAULTS.activeTab.left;
    let   right = isTab(saved.activeTab?.right) ? saved.activeTab.right : DEFAULTS.activeTab.right;
    if (right === left) right = tabOrder.find((t) => t !== left)!;

    const split = typeof saved.split === 'boolean' ? saved.split : DEFAULTS.split;

    return {
      sidebarOpen: typeof saved.sidebarOpen === 'boolean' ? saved.sidebarOpen : DEFAULTS.sidebarOpen,
      tabOrder,
      split,
      activeTab:   { left, right },
      focusedPane: split && saved.focusedPane === 'right' ? 'right' : 'left',
      splitRatio:  typeof saved.splitRatio === 'number' ? clampRatio(saved.splitRatio) : DEFAULTS.splitRatio,
    };
  } catch { /* ignore */ }
  return DEFAULTS;
}

const otherPane = (p: Pane): Pane => (p === 'left' ? 'right' : 'left');

interface LayoutStore extends PersistedLayout {
  toggleSidebar: () => void;
  /** Show `tab` in `pane`. In split view, a tab already shown in the other pane swaps over. */
  selectTab:     (pane: Pane, tab: WorkspaceTab) => void;
  /** Reorder: move `tab` in front of `before` (or to the end when `before` is null). */
  moveTab:       (tab: WorkspaceTab, before: WorkspaceTab | null) => void;
  /** Open the split view, optionally with a given tab in the right pane. */
  openSplit:     (tab?: WorkspaceTab) => void;
  /** Close one pane of the split view; the other pane's tab stays visible. */
  closePane:     (pane: Pane) => void;
  focusPane:     (pane: Pane) => void;
  setSplitRatio: (ratio: number) => void;
}

export const useLayoutStore = create<LayoutStore>((set, get) => ({
  ...loadLayout(),

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  selectTab: (pane, tab) => {
    const { split, activeTab } = get();
    if (!split) {
      set({ activeTab: { ...activeTab, left: tab }, focusedPane: 'left' });
      return;
    }
    const other = otherPane(pane);
    const next  = { ...activeTab, [pane]: tab };
    // Never show the same tab twice -- swap it with this pane's previous tab
    if (activeTab[other] === tab) next[other] = activeTab[pane];
    set({ activeTab: next, focusedPane: pane });
  },

  moveTab: (tab, before) => {
    if (tab === before) return;
    const order = get().tabOrder.filter((t) => t !== tab);
    const at    = before === null ? order.length : order.indexOf(before);
    order.splice(at < 0 ? order.length : at, 0, tab);
    set({ tabOrder: order });
  },

  openSplit: (tab) => {
    const { activeTab, tabOrder } = get();
    const left = activeTab.left;
    // Default right tab: the next tab after the left one in strip order
    const fallback = tabOrder[(tabOrder.indexOf(left) + 1) % tabOrder.length];
    const right = tab && tab !== left ? tab : fallback;
    set({ split: true, activeTab: { left, right }, focusedPane: 'right' });
  },

  closePane: (pane) => {
    const { activeTab } = get();
    const keep = activeTab[otherPane(pane)];
    // The closed tab becomes the right-pane default for the next split
    set({ split: false, activeTab: { left: keep, right: activeTab[pane] }, focusedPane: 'left' });
  },

  focusPane: (pane) => {
    if (get().focusedPane !== pane) set({ focusedPane: pane });
  },

  setSplitRatio: (ratio) => set({ splitRatio: clampRatio(ratio) }),
}));

// Write-through persistence -- every layout change is saved immediately
useLayoutStore.subscribe((s) => {
  const snapshot: PersistedLayout = {
    sidebarOpen: s.sidebarOpen,
    tabOrder:    s.tabOrder,
    split:       s.split,
    activeTab:   s.activeTab,
    focusedPane: s.focusedPane,
    splitRatio:  s.splitRatio,
  };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)); } catch { /* ignore */ }
});
