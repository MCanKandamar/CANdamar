/**
 * Workspace.tsx
 * -------------
 * Main working area with Chrome-style tabs: frame table, CANopen and J1939
 * decoders, and the signal plot. Replaces the old fixed right-hand
 * protocol panel so every view gets the full width of the window.
 *
 * - Tabs can be reordered by dragging them along the strip.
 * - Split view shows two tabs side by side. The divider is draggable
 *   (double-click resets it to 50/50). Dragging a tab onto the other
 *   pane's strip shows it in that pane.
 * - A tab is mounted the first time it is shown and then kept alive
 *   (hidden with display:none), so scroll positions, form inputs and
 *   decoder sub-tabs survive tab switches. All tab bodies are siblings
 *   in one flex row and are positioned only with CSS `order`, so moving
 *   a tab between panes never remounts it.
 */

import { useCallback, useRef, useState } from 'react';
import { MessageTable } from '../MessageTable/MessageTable';
import { CANopenPanel } from '../CANopenPanel/CANopenPanel';
import { J1939Panel } from '../J1939Panel/J1939Panel';
import { SignalPlot } from '../SignalPlot/SignalPlot';
import { useLayoutStore, WORKSPACE_TABS } from '../../store/layoutStore';
import type { Pane, WorkspaceTab } from '../../store/layoutStore';
import { useJ1939Store } from '../../store/j1939Store';
import { useCANopenStore } from '../../store/canopenStore';

// Custom MIME type so only our own tabs are accepted as drop payloads
const DRAG_MIME = 'application/x-canviz-tab';

const DIVIDER_PX = 6;

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

function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  );
}

// ── Tab strip ────────────────────────────────────────────────────────────────

interface TabStripProps {
  pane: Pane;
  style: React.CSSProperties;
  showSplitButton: boolean;
}

function TabStrip({ pane, style, showSplitButton }: TabStripProps) {
  const tabOrder    = useLayoutStore((s) => s.tabOrder);
  const split       = useLayoutStore((s) => s.split);
  const activeTab   = useLayoutStore((s) => s.activeTab);
  const focusedPane = useLayoutStore((s) => s.focusedPane);
  const selectTab   = useLayoutStore((s) => s.selectTab);
  const moveTab     = useLayoutStore((s) => s.moveTab);
  const openSplit   = useLayoutStore((s) => s.openSplit);
  const closePane   = useLayoutStore((s) => s.closePane);

  // Amber dot: protocol traffic seen while its decoder is still off
  const j1939Dot   = useJ1939Store((s) => s.autoDetected && s.mode === 'off');
  const canopenDot = useCANopenStore((s) => s.autoDetected && s.mode === 'off');
  const dotFor = (tab: WorkspaceTab) =>
    (tab === 'canopen' && canopenDot) || (tab === 'j1939' && j1939Dot);

  const [dragTab, setDragTab]   = useState<WorkspaceTab | null>(null);
  const [dropOver, setDropOver] = useState<WorkspaceTab | 'end' | null>(null);

  const otherTab = split ? activeTab[pane === 'left' ? 'right' : 'left'] : null;

  const onDragStart = (e: React.DragEvent, tab: WorkspaceTab) => {
    e.dataTransfer.setData(DRAG_MIME, `${pane}:${tab}`);
    e.dataTransfer.effectAllowed = 'move';
    setDragTab(tab);
  };

  const onDragOver = (e: React.DragEvent, target: WorkspaceTab | 'end') => {
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (dropOver !== target) setDropOver(target);
  };

  const onDrop = (e: React.DragEvent, target: WorkspaceTab | 'end') => {
    const payload = e.dataTransfer.getData(DRAG_MIME);
    setDropOver(null);
    if (!payload) return;
    e.preventDefault();
    e.stopPropagation();
    const [fromPane, tab] = payload.split(':') as [Pane, WorkspaceTab];
    moveTab(tab, target === 'end' ? null : target);
    // Dropped on the other pane's strip: show the tab there
    if (split && fromPane !== pane) selectTab(pane, tab);
  };

  const classes = ['ws-strip'];
  if (!split || focusedPane === pane) classes.push('focused');

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
      {tabOrder.map((tab) => {
        const label    = WORKSPACE_TABS.find((t) => t.id === tab)?.label ?? tab;
        const isActive = activeTab[pane] === tab;
        const cls = ['ws-tab'];
        if (isActive)              cls.push('active');
        if (tab === otherTab)      cls.push('elsewhere');
        if (tab === dragTab)       cls.push('dragging');
        if (dropOver === tab && dragTab !== tab) cls.push('drop-before');
        return (
          <button
            key={tab}
            className={cls.join(' ')}
            role="tab"
            aria-selected={isActive}
            draggable
            onClick={() => selectTab(pane, tab)}
            onDragStart={(e) => onDragStart(e, tab)}
            onDragEnd={() => { setDragTab(null); setDropOver(null); }}
            onDragOver={(e) => onDragOver(e, tab)}
            onDrop={(e) => onDrop(e, tab)}
            title={tab === otherTab ? `${label} (shown in the other pane -- click to swap)` : label}
          >
            <span className="ws-tab-label">{label}</span>
            {dotFor(tab) && (
              <span className="ws-tab-dot" title={`${label} traffic detected -- enable decoder`} />
            )}
          </button>
        );
      })}

      <div className={`ws-strip-end${dropOver === 'end' ? ' drop-before' : ''}`} />

      {showSplitButton && !split && (
        <button className="ws-strip-btn" onClick={() => openSplit()}
          title="Split view -- show two tabs side by side" aria-label="Split view">
          <SplitIcon />
        </button>
      )}
      {split && (
        <button className="ws-strip-btn" onClick={() => closePane(pane)}
          title="Close this pane" aria-label="Close this pane">
          <CloseIcon />
        </button>
      )}
    </div>
  );
}

// ── Tab content ──────────────────────────────────────────────────────────────

function TabContent({ tab }: { tab: WorkspaceTab }) {
  switch (tab) {
    case 'frames':  return <MessageTable />;
    case 'canopen': return <div className="ws-scroll"><CANopenPanel /></div>;
    case 'j1939':   return <div className="ws-scroll"><J1939Panel /></div>;
    case 'plot':    return <div className="ws-plot"><SignalPlot /></div>;
  }
}

// ── Workspace ────────────────────────────────────────────────────────────────

export function Workspace() {
  const split         = useLayoutStore((s) => s.split);
  const activeTab     = useLayoutStore((s) => s.activeTab);
  const splitRatio    = useLayoutStore((s) => s.splitRatio);
  const focusPane     = useLayoutStore((s) => s.focusPane);
  const setSplitRatio = useLayoutStore((s) => s.setSplitRatio);

  const bodyRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  // Lazy mount: a tab is rendered once it has been shown, then kept alive
  const mounted = useRef(new Set<WorkspaceTab>());
  mounted.current.add(activeTab.left);
  if (split) mounted.current.add(activeTab.right);

  const paneOf = (tab: WorkspaceTab): Pane | null => {
    if (tab === activeTab.left) return 'left';
    if (split && tab === activeTab.right) return 'right';
    return null;
  };

  // Left pane width; the divider takes DIVIDER_PX out of the remaining space
  const leftFlex = split
    ? `0 0 calc(${(splitRatio * 100).toFixed(2)}% - ${DIVIDER_PX / 2}px)`
    : '1 1 0';

  const paneStyle = (pane: Pane | null): React.CSSProperties => {
    if (pane === null)   return { display: 'none' };
    if (pane === 'left') return { order: 0, flex: leftFlex };
    return { order: 2, flex: '1 1 0' };
  };

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
        <TabStrip pane="left" style={{ flex: leftFlex }} showSplitButton />
        {split && (
          <>
            <div className="ws-strip-gap" style={{ flex: `0 0 ${DIVIDER_PX}px` }} />
            <TabStrip pane="right" style={{ flex: '1 1 0' }} showSplitButton={false} />
          </>
        )}
      </div>

      {/* Tab bodies */}
      <div className="ws-body" ref={bodyRef}>
        {WORKSPACE_TABS.map(({ id }) => {
          if (!mounted.current.has(id)) return null;
          const pane = paneOf(id);
          return (
            <div
              key={id}
              className="ws-pane"
              style={paneStyle(pane)}
              onMouseDownCapture={() => pane && focusPane(pane)}
            >
              <TabContent tab={id} />
            </div>
          );
        })}

        {split && (
          <div
            className={`ws-divider${dragging ? ' dragging' : ''}`}
            style={{ order: 1, flex: `0 0 ${DIVIDER_PX}px` }}
            onMouseDown={onDividerMouseDown}
            onDoubleClick={() => setSplitRatio(0.5)}
            title="Drag to resize -- double-click to reset"
          >
            <div className="ws-divider-grip" />
          </div>
        )}
      </div>
    </div>
  );
}
