import { useState, useRef, useCallback, useEffect } from 'react';
import { useLayoutStore } from '../../store/layoutStore';
import { TabStrip, PaneBody, CloseIcon } from '../Workspace/Workspace';

// The bottom pane of the tab layout: its tabs (Send Frame, Record, Replay by
// default, plus any tab dropped here) use the same strip and body as the
// workspace panes. This component adds the height handle and collapse /
// maximize; it is only rendered while the bottom pane has tabs.

const MIN_HEIGHT     = 160;
const DEFAULT_HEIGHT = 300;
const HANDLE_HEIGHT  = 8;
const TABBAR_HEIGHT  = 36;                 // .ws-strip height
const COLLAPSED_HEIGHT = HANDLE_HEIGHT + TABBAR_HEIGHT;
const MIN_WORKSPACE  = 140;                // workspace space kept above a maximized panel
const STORAGE_KEY    = 'canviz:bottomPanelHeight';
const OLD_STORAGE_KEY = 'canvaz:bottomPanelHeight';   // key used before the package rename

function loadHeight(): number {
  try {
    const v = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(OLD_STORAGE_KEY);
    if (v) return Math.max(MIN_HEIGHT, parseInt(v));
  } catch { /* ignore */ }
  return DEFAULT_HEIGHT;
}

// Largest height that still leaves room for the top bar and the workspace
function maxHeightFor(viewportH: number): number {
  const topbar = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--topbar-height')) || 44;
  return Math.max(MIN_HEIGHT, viewportH - topbar - MIN_WORKSPACE);
}

function ChevronIcon({ up }: { up: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      {up ? <polyline points="6 15 12 9 18 15" /> : <polyline points="6 9 12 15 18 9" />}
    </svg>
  );
}

function MaximizeIcon({ restore }: { restore: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {restore ? (
        <>
          <rect x="4" y="8" width="12" height="12" rx="1" />
          <polyline points="8 8 8 4 20 4 20 16 16 16" />
        </>
      ) : (
        <rect x="4" y="4" width="16" height="16" rx="1" />
      )}
    </svg>
  );
}

export function BottomPanel() {
  const [height, setHeight]       = useState<number>(loadHeight);
  const [viewportH, setViewportH] = useState<number>(window.innerHeight);
  const [dragging, setDragging]   = useState(false);
  const mode          = useLayoutStore((s) => s.bottomMode);
  const setBottomMode = useLayoutStore((s) => s.setBottomMode);
  const closePane     = useLayoutStore((s) => s.closePane);
  const dragStartY = useRef(0);
  const dragStartH = useRef(0);

  // Limits follow the window size instead of a fixed pixel maximum
  useEffect(() => {
    const onResize = () => setViewportH(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const maxHeight = maxHeightFor(viewportH);
  const normalHeight = Math.min(maxHeight, Math.max(MIN_HEIGHT, height));
  const effectiveHeight =
    mode === 'collapsed' ? COLLAPSED_HEIGHT :
    mode === 'maximized' ? maxHeight :
    normalHeight;

  useEffect(() => {
    document.documentElement.style.setProperty('--bottompanel-height', `${effectiveHeight}px`);
  }, [effectiveHeight]);

  // No bottom pane: give its grid row back to the workspace
  useEffect(() => () => {
    document.documentElement.style.setProperty('--bottompanel-height', '0px');
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, String(height)); } catch { /* ignore */ }
  }, [height]);

  // Listeners are attached synchronously on mousedown so even a fast drag is tracked.
  // Dragging always returns the panel to normal mode at the dragged height.
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragStartY.current = e.clientY;
    dragStartH.current = effectiveHeight;
    setDragging(true);
    const onMove = (ev: MouseEvent) => {
      const delta = dragStartY.current - ev.clientY;
      if (Math.abs(delta) < 2) return;
      setBottomMode('normal');
      setHeight(Math.min(maxHeightFor(window.innerHeight), Math.max(MIN_HEIGHT, dragStartH.current + delta)));
    };
    const onUp = () => {
      setDragging(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [effectiveHeight, setBottomMode]);

  const toggleCollapsed = () => setBottomMode(mode === 'collapsed' ? 'normal' : 'collapsed');
  const toggleMaximized = () => setBottomMode(mode === 'maximized' ? 'normal' : 'maximized');

  // Clicking a tab of a collapsed panel opens it again
  const onStripClick = () => {
    if (mode === 'collapsed') setBottomMode('normal');
  };

  return (
    <div className="app-bottom panel" style={styles.panel}>
      {/* Drag handle -- double-click to maximize / restore */}
      <div
        style={{
          ...styles.handle,
          cursor: 'ns-resize',
          background: dragging ? 'var(--accent-green-dim)' : 'var(--bg-panel)',
        }}
        onMouseDown={onMouseDown}
        onDoubleClick={toggleMaximized}
        title="Drag to resize -- double-click to maximize / restore"
      >
        <div style={styles.handleGrip} />
      </div>

      {/* Tab strip */}
      <div onClickCapture={onStripClick} style={{ display: 'flex', flexShrink: 0 }}>
        <TabStrip pane="bottom" style={{ flex: 1 }}>
          <button
            className="ws-strip-btn"
            onClick={toggleMaximized}
            title={mode === 'maximized' ? 'Restore panel' : 'Maximize panel'}
            aria-label={mode === 'maximized' ? 'Restore panel' : 'Maximize panel'}
          >
            <MaximizeIcon restore={mode === 'maximized'} />
          </button>
          <button
            className="ws-strip-btn"
            onClick={toggleCollapsed}
            title={mode === 'collapsed' ? 'Expand panel' : 'Collapse panel'}
            aria-label={mode === 'collapsed' ? 'Expand panel' : 'Collapse panel'}
          >
            <ChevronIcon up={mode === 'collapsed'} />
          </button>
          <button className="ws-strip-btn" onClick={() => closePane('bottom')}
            title="Close this pane -- its tabs go back to the main pane" aria-label="Close this pane">
            <CloseIcon />
          </button>
        </TabStrip>
      </div>

      {/* Content -- hidden, not unmounted, while collapsed */}
      <PaneBody pane="bottom" style={{ flex: 1, display: mode === 'collapsed' ? 'none' : undefined }} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    borderTop: 'none',
    borderRight: 'none',
    borderLeft: '1px solid var(--border-subtle)',
    borderBottom: 'none',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  handle: {
    height: HANDLE_HEIGHT,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderTop: '1px solid var(--border-subtle)',
    userSelect: 'none',
    transition: 'background 100ms',
  },
  handleGrip: {
    width: 32,
    height: 3,
    borderRadius: 2,
    background: 'var(--border-strong)',
    pointerEvents: 'none',
  },
};
