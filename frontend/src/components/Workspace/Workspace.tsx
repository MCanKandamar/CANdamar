/**
 * Workspace.tsx
 * -------------
 * Chrome-style tabs in three panes: main, right and bottom (see
 * layoutStore.ts). The main and right panes share the workspace area with a
 * draggable divider (double-click resets it to 50/50); the bottom pane is
 * BottomPanel.tsx, which reuses TabStrip and PaneBody from here.
 *
 * - Tabs are reordered by dragging them along a strip, and moved to another
 *   pane by dropping them on its strip or its content.
 * - While a tab is dragged, the content areas show drop zones: the right
 *   edge of the main pane opens the right pane, the bottom edge of the main
 *   or right pane moves the tab to the bottom pane. A shadow shows where the
 *   tab will go. A pane left empty closes.
 * - A tab is mounted the first time it is shown and then kept alive. Each
 *   tab body is rendered (through a portal) into its own DOM element, and
 *   that element is moved between panes, so moving a tab never remounts it:
 *   scroll positions, form inputs and sub-tabs survive.
 */

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MessageTable } from '../MessageTable/MessageTable';
import { CANopenPanel } from '../CANopenPanel/CANopenPanel';
import { J1939Panel } from '../J1939Panel/J1939Panel';
import { SignalPlot } from '../SignalPlot/SignalPlot';
import { SendFramePanel } from '../SendFramePanel/SendFramePanel';
import { LogControls } from '../LogControls/LogControls';
import { ReplayPanel } from '../ReplayPanel/ReplayPanel';
import {
  useLayoutStore, PANES, tabLabel, paneOf, canMoveTo,
  type PaneId, type TabId,
} from '../../store/layoutStore';
import { useJ1939Store } from '../../store/j1939Store';
import { useCANopenStore } from '../../store/canopenStore';

// Custom MIME type so only our own tabs are accepted as drop payloads
const DRAG_MIME = 'application/x-canviz-tab';

const DIVIDER_PX = 6;
const EDGE_ZONE  = 0.3;   // outer 30 % of a pane's content opens a pane there

// ── Icons ────────────────────────────────────────────────────────────────────

function SplitIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  );
}

// ── Drag helpers ─────────────────────────────────────────────────────────────

function draggedTab(e: React.DragEvent): TabId | null {
  if (!e.dataTransfer.types.includes(DRAG_MIME)) return null;
  // The payload itself is only readable on drop; the store knows the tab
  return useLayoutStore.getState().draggingTab;
}

/** Whether dropping `tab` into `pane` changes anything that is allowed. */
function dropAllowed(tab: TabId, pane: PaneId): boolean {
  const { panes } = useLayoutStore.getState();
  if (!canMoveTo(tab, pane)) return false;
  // The last tab of the main pane stays there
  return !(paneOf(panes, tab) === 'main' && pane !== 'main' && panes.main.length === 1);
}

// ── Tab strip ────────────────────────────────────────────────────────────────

interface TabStripProps {
  pane: PaneId;
  style?: React.CSSProperties;
  /** Buttons at the right end of the strip */
  children?: React.ReactNode;
}

export function TabStrip({ pane, style, children }: TabStripProps) {
  const tabs           = useLayoutStore((s) => s.panes[pane]);
  const active         = useLayoutStore((s) => s.active[pane]);
  const focusedPane    = useLayoutStore((s) => s.focusedPane);
  const draggingTab    = useLayoutStore((s) => s.draggingTab);
  const selectTab      = useLayoutStore((s) => s.selectTab);
  const moveTab        = useLayoutStore((s) => s.moveTab);
  const setDraggingTab = useLayoutStore((s) => s.setDraggingTab);

  // Amber dot: protocol traffic seen while its decoder is still off
  const j1939Dot   = useJ1939Store((s) => s.autoDetected && s.mode === 'off');
  const canopenDot = useCANopenStore((s) => s.autoDetected && s.mode === 'off');
  const dotFor = (tab: TabId) =>
    (tab === 'canopen' && canopenDot) || (tab === 'j1939' && j1939Dot);

  const [dropOver, setDropOver] = useState<TabId | 'end' | null>(null);

  const onDragStart = (e: React.DragEvent, tab: TabId) => {
    e.dataTransfer.setData(DRAG_MIME, tab);
    e.dataTransfer.effectAllowed = 'move';
    // Defer so the browser takes the drag image before the drop zones appear
    setTimeout(() => setDraggingTab(tab), 0);
  };

  const onDragOver = (e: React.DragEvent, target: TabId | 'end') => {
    const tab = draggedTab(e);
    if (!tab || !dropAllowed(tab, pane)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (dropOver !== target) setDropOver(target);
  };

  const onDrop = (e: React.DragEvent, target: TabId | 'end') => {
    const tab = e.dataTransfer.getData(DRAG_MIME) as TabId;
    setDropOver(null);
    setDraggingTab(null);
    if (!tab) return;
    e.preventDefault();
    e.stopPropagation();
    moveTab(tab, pane, target === 'end' ? null : target);
  };

  const classes = ['ws-strip'];
  if (focusedPane === pane) classes.push('focused');

  return (
    <div
      className={classes.join(' ')}
      style={style}
      role="tablist"
      onDragOver={(e) => onDragOver(e, 'end')}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropOver(null);
      }}
      onDrop={(e) => onDrop(e, 'end')}
    >
      {tabs.map((tab) => {
        const label    = tabLabel(tab);
        const isActive = active === tab;
        const cls = ['ws-tab'];
        if (isActive)            cls.push('active');
        if (tab === draggingTab) cls.push('dragging');
        if (dropOver === tab && draggingTab !== tab) cls.push('drop-before');
        return (
          <button
            key={tab}
            className={cls.join(' ')}
            role="tab"
            aria-selected={isActive}
            draggable
            onClick={() => selectTab(pane, tab)}
            onDragStart={(e) => onDragStart(e, tab)}
            onDragEnd={() => { setDraggingTab(null); setDropOver(null); }}
            onDragOver={(e) => onDragOver(e, tab)}
            onDrop={(e) => onDrop(e, tab)}
            title={`${label} -- drag to reorder or to another pane`}
          >
            <span className="ws-tab-label">{label}</span>
            {dotFor(tab) && (
              <span className="ws-tab-dot" title={`${label} traffic detected -- enable decoder`} />
            )}
          </button>
        );
      })}

      <div className={`ws-strip-end${dropOver === 'end' ? ' drop-before' : ''}`} />

      {children}
    </div>
  );
}

// ── Tab content ──────────────────────────────────────────────────────────────

function TabContent({ tab }: { tab: TabId }) {
  switch (tab) {
    case 'frames':  return <MessageTable />;
    case 'canopen': return <div className="ws-scroll"><CANopenPanel /></div>;
    case 'j1939':   return <div className="ws-scroll"><J1939Panel /></div>;
    case 'plot':    return <div className="ws-plot"><SignalPlot /></div>;
    case 'send':    return <div className="ws-scroll"><SendFramePanel /></div>;
    case 'record':  return <div className="ws-scroll"><LogControls /></div>;
    case 'replay':  return <div className="ws-scroll"><ReplayPanel /></div>;
  }
}

// One persistent element per tab; PaneBody moves it into the pane holding the tab
const hosts = new Map<TabId, HTMLDivElement>();

function hostFor(tab: TabId): HTMLDivElement {
  let el = hosts.get(tab);
  if (!el) {
    el = document.createElement('div');
    el.className = 'ws-host';
    hosts.set(tab, el);
  }
  return el;
}

/** Renders every tab that has been shown into its host element. */
function TabBodies() {
  const active  = useLayoutStore((s) => s.active);
  const mounted = useRef(new Set<TabId>());
  for (const pane of PANES) {
    const tab = active[pane];
    if (tab) mounted.current.add(tab);
  }
  return <>{[...mounted.current].map((tab) => createPortal(<TabContent tab={tab} />, hostFor(tab), tab))}</>;
}

// ── Pane body with drop zones ────────────────────────────────────────────────

type DropTarget = { pane: PaneId; shadow: React.CSSProperties };

/** Where a tab dropped at (x, y) inside `pane`'s content would go. */
function dropTargetAt(pane: PaneId, tab: TabId, rect: DOMRect, x: number, y: number): DropTarget | null {
  const { panes } = useLayoutStore.getState();
  const fx = (x - rect.left) / rect.width;
  const fy = (y - rect.top) / rect.height;
  const candidates: DropTarget[] = [];
  if (pane !== 'bottom' && fy > 1 - EDGE_ZONE) {
    candidates.push({ pane: 'bottom', shadow: { left: 0, right: 0, top: `${(1 - EDGE_ZONE) * 100}%`, bottom: 0 } });
  }
  if (pane === 'main' && panes.right.length === 0 && fx > 1 - EDGE_ZONE) {
    candidates.push({ pane: 'right', shadow: { left: '50%', right: 0, top: 0, bottom: 0 } });
  }
  candidates.push({ pane, shadow: { left: 0, right: 0, top: 0, bottom: 0 } });
  return candidates.find((c) => dropAllowed(tab, c.pane)) ?? null;
}

interface PaneBodyProps {
  pane: PaneId;
  style?: React.CSSProperties;
}

export function PaneBody({ pane, style }: PaneBodyProps) {
  const tabs           = useLayoutStore((s) => s.panes[pane]);
  const active         = useLayoutStore((s) => s.active[pane]);
  const draggingTab    = useLayoutStore((s) => s.draggingTab);
  const focusPane      = useLayoutStore((s) => s.focusPane);
  const moveTab        = useLayoutStore((s) => s.moveTab);
  const selectTab      = useLayoutStore((s) => s.selectTab);
  const setDraggingTab = useLayoutStore((s) => s.setDraggingTab);

  const slotRef = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState<DropTarget | null>(null);

  // Place this pane's tab hosts in the slot; only the active one is visible.
  // The slot has no React children, so React never touches these nodes.
  useLayoutEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;
    for (const tab of tabs) {
      const host = hostFor(tab);
      if (host.parentElement !== slot) slot.appendChild(host);
      host.style.display = tab === active ? '' : 'none';
    }
  }, [tabs, active]);

  const onDragOver = (e: React.DragEvent) => {
    const tab = draggedTab(e);
    if (!tab) return;
    const t = dropTargetAt(pane, tab, e.currentTarget.getBoundingClientRect(), e.clientX, e.clientY);
    if (!t) { setTarget(null); return; }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (t.pane !== target?.pane) setTarget(t);
  };

  const onDrop = (e: React.DragEvent) => {
    const tab = e.dataTransfer.getData(DRAG_MIME) as TabId;
    const t   = target;
    setTarget(null);
    setDraggingTab(null);
    if (!tab || !t) return;
    e.preventDefault();
    const { panes } = useLayoutStore.getState();
    if (paneOf(panes, tab) === t.pane) selectTab(t.pane, tab);
    else moveTab(tab, t.pane, null);
  };

  return (
    <div className="ws-pane" style={style} onMouseDownCapture={() => focusPane(pane)}>
      <div className="ws-slot" ref={slotRef} />
      {draggingTab && (
        <div
          className="ws-drop-layer"
          onDragOver={onDragOver}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setTarget(null);
          }}
          onDrop={onDrop}
        >
          {target && <div className="ws-drop-shadow" style={target.shadow} />}
        </div>
      )}
    </div>
  );
}

// ── Workspace (main + right panes) ───────────────────────────────────────────

export function Workspace() {
  const hasRight      = useLayoutStore((s) => s.panes.right.length > 0);
  const mainCount     = useLayoutStore((s) => s.panes.main.length);
  const splitRatio    = useLayoutStore((s) => s.splitRatio);
  const setSplitRatio = useLayoutStore((s) => s.setSplitRatio);
  const openSplit     = useLayoutStore((s) => s.openSplit);
  const closePane     = useLayoutStore((s) => s.closePane);

  const bodyRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  // Main pane width; the divider takes DIVIDER_PX out of the remaining space
  const mainFlex = hasRight
    ? `0 0 calc(${(splitRatio * 100).toFixed(2)}% - ${DIVIDER_PX / 2}px)`
    : '1 1 0';

  // Listeners are attached synchronously on mousedown so even a fast drag
  // (press-move-release before the next render) is tracked.
  const onDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    const onMove = (ev: MouseEvent) => {
      const rect = bodyRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      setSplitRatio((ev.clientX - rect.left) / rect.width);
    };
    const onUp = () => {
      setDragging(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [setSplitRatio]);

  return (
    <div className={`app-main workspace${dragging ? ' resizing' : ''}`}>
      {/* Tab strips -- one per pane, aligned with the panes below */}
      <div className="ws-strips">
        <TabStrip pane="main" style={{ flex: mainFlex }}>
          {!hasRight && mainCount > 1 && (
            <button className="ws-strip-btn" onClick={openSplit}
              title="Split view -- or drag a tab to the right edge" aria-label="Split view">
              <SplitIcon />
            </button>
          )}
        </TabStrip>
        {hasRight && (
          <>
            <div className="ws-strip-gap" style={{ flex: `0 0 ${DIVIDER_PX}px` }} />
            <TabStrip pane="right" style={{ flex: '1 1 0' }}>
              <button className="ws-strip-btn" onClick={() => closePane('right')}
                title="Close this pane -- its tabs go back to the left" aria-label="Close this pane">
                <CloseIcon />
              </button>
            </TabStrip>
          </>
        )}
      </div>

      {/* Pane bodies */}
      <div className="ws-body" ref={bodyRef}>
        <PaneBody pane="main" style={{ flex: mainFlex }} />
        {hasRight && (
          <>
            <div
              className={`ws-divider${dragging ? ' dragging' : ''}`}
              style={{ flex: `0 0 ${DIVIDER_PX}px` }}
              onMouseDown={onDividerMouseDown}
              onDoubleClick={() => setSplitRatio(0.5)}
              title="Drag to resize -- double-click to reset"
            >
              <div className="ws-divider-grip" />
            </div>
            <PaneBody pane="right" style={{ flex: '1 1 0' }} />
          </>
        )}
      </div>

      <TabBodies />
    </div>
  );
}
