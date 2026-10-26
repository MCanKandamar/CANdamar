import { Fragment, useRef, useEffect, useMemo, useState, useCallback } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  type ColumnDef,
  type ColumnSizingState,
  flexRender,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useFrameStore } from '../../store/frameStore';
import { useFrameViewStore } from '../../store/frameViewStore';
import { TraceTable } from './TraceTable';
import { useJ1939Store } from '../../store/j1939Store';
import { useCANopenStore } from '../../store/canopenStore';
import type { FrameRow, DecodedSignal } from '../../types/can';
import { canopenDetail, canopenTypeColor } from '../../utils/canopenDisplay';

const FLASH_DURATION_MS = 400;
const ROW_HEIGHT = 30;
const SIGNAL_ROW_HEIGHT = 18;
const HEADER_HEIGHT = 30;
const EXPAND_WIDTH = 30;
const MIN_COLUMN_WIDTH = 32;

// Column widths set by dragging a header edge; double-click restores the default
const SIZING_KEY = 'canviz:frameColumns';

function loadColumnSizing(): ColumnSizingState {
  try {
    const raw = JSON.parse(localStorage.getItem(SIZING_KEY) ?? '{}');
    const out: ColumnSizingState = {};
    if (raw && typeof raw === 'object') {
      for (const [id, w] of Object.entries(raw)) {
        if (typeof w === 'number' && w >= MIN_COLUMN_WIDTH) out[id] = w;
      }
    }
    return out;
  } catch {
    return {};
  }
}

// ── Flash tracker ─────────────────────────────────────────────────────────────
const flashTimers = new Map<number, ReturnType<typeof setTimeout>>();

function triggerFlash(el: HTMLElement, id: number) {
  if (flashTimers.has(id)) {
    clearTimeout(flashTimers.get(id));
    el.classList.remove('row-flash');
    void el.offsetHeight;
  }
  el.classList.add('row-flash');
  const t = setTimeout(() => {
    el.classList.remove('row-flash');
    flashTimers.delete(id);
  }, FLASH_DURATION_MS);
  flashTimers.set(id, t);
}

// ── Rate colorizer ────────────────────────────────────────────────────────────
function rateColor(fps: number): string {
  if (fps === 0) return 'var(--text-muted)';
  if (fps < 10)  return 'var(--text-secondary)';
  if (fps < 100) return 'var(--accent-amber)';
  return 'var(--accent-red)';
}

// ── Signal sub-row ────────────────────────────────────────────────────────────
function SignalRows({ signals }: { signals: DecodedSignal[] }) {
  return (
    <div style={styles.signalContainer}>
      {signals.map((sig) => (
        <div key={sig.name} style={styles.signalRow}>
          <span style={styles.signalName}>{sig.message_name}.{sig.name}</span>
          <span style={styles.signalValue} className="mono">
            {typeof sig.value === 'number' ? sig.value.toFixed(3) : sig.value}
          </span>
          <span style={styles.signalUnit}>{sig.unit}</span>
        </div>
      ))}
    </div>
  );
}

// ── Data bytes with change highlight ──────────────────────────────────────────
// A byte that differs from the previous frame of the same ID flashes amber.
// The span's key includes the change time, so each change restarts the CSS
// animation; unchanged bytes keep their element and do not flash again.
function DataBytes({ row }: { row: FrameRow }) {
  return (
    <span className="mono" style={styles.dataCell}>
      {row.data.map((b, i) => {
        const changed = row.changedAt?.[i] ?? 0;
        return (
          <Fragment key={i}>
            {i > 0 && ' '}
            <span key={changed} className={changed ? 'byte-flash' : undefined}>
              {b.toString(16).toUpperCase().padStart(2, '0')}
            </span>
          </Fragment>
        );
      })}
    </span>
  );
}

// ── Base column definitions (always shown) ────────────────────────────────────
const BASE_COLUMNS: ColumnDef<FrameRow>[] = [
  {
    id: 'expand',
    size: 24,
    cell: () => null,
  },
  {
    accessorKey: 'idHex',
    header: 'ID',
    size: 90,
    cell: (info) => (
      <span className="mono" style={styles.idCell}>
        {info.getValue<string>()}
      </span>
    ),
  },
  {
    accessorKey: 'dlc',
    header: 'DLC',
    size: 40,
    cell: (info) => (
      <span className="mono" style={{ color: 'var(--text-secondary)' }}>
        {info.getValue<number>()}
      </span>
    ),
  },
  {
    accessorKey: 'dataHex',
    header: 'Data',
    size: 220,
    cell: (info) => info.row.original.isRemote ? (
      // Remote (RTR) frame: no payload, the DLC is the requested length
      <span className="mono" style={{ ...styles.dataCell, color: 'var(--text-muted)' }}>
        remote request
      </span>
    ) : (
      <DataBytes row={info.row.original} />
    ),
  },
  {
    accessorKey: 'count',
    header: 'Count',
    size: 70,
    cell: (info) => (
      <span className="mono" style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
        {info.getValue<number>().toLocaleString()}
      </span>
    ),
  },
  {
    accessorKey: 'rate',
    header: 'Rate',
    size: 60,
    cell: (info) => {
      const fps = info.getValue<number>();
      return (
        <span className="mono" style={{ color: rateColor(fps), fontSize: 11, fontWeight: 500 }}>
          {fps}
        </span>
      );
    },
  },
  {
    accessorKey: 'lastSeen',
    header: 'Last Seen',
    size: 90,
    cell: (info) => {
      const ms = info.getValue<number>();
      const d = new Date(ms);
      return (
        <span className="mono" style={styles.timeCell}>
          {d.toTimeString().slice(0, 8)}.{String(d.getMilliseconds()).padStart(3, '0')}
        </span>
      );
    },
  },
];

// ── J1939 column definitions (appended when decoder is on) ────────────────────
const J1939_COLUMNS: ColumnDef<FrameRow>[] = [
  {
    id: 'j1939_pgn',
    header: 'PGN',
    size: 70,
    cell: ({ row }) => {
      const j = row.original.j1939;
      if (!j) return <span style={styles.j1939Absent}>—</span>;
      return (
        <span className="mono" style={{ color: 'var(--accent-blue)', fontSize: 11 }}>
          {j.pgn_hex}
        </span>
      );
    },
  },
  {
    id: 'j1939_pgn_name',
    header: 'PGN Name',
    size: 180,
    cell: ({ row }) => {
      const j = row.original.j1939;
      if (!j) return <span style={styles.j1939Absent}>—</span>;
      return (
        <span style={styles.pgnName} title={j.pgn_name}>
          {j.pgn_name}
        </span>
      );
    },
  },
  {
    id: 'j1939_sa',
    header: 'SA',
    size: 80,
    cell: ({ row }) => {
      const j = row.original.j1939;
      if (!j) return <span style={styles.j1939Absent}>—</span>;
      return (
        <span title={j.sa_name} style={styles.saCell}>
          <span className="mono" style={{ color: 'var(--accent-amber)', fontSize: 11 }}>
            {j.sa_hex}
          </span>
          <span style={styles.saName}>{j.sa_name}</span>
        </span>
      );
    },
  },
  {
    id: 'j1939_da',
    header: 'DA',
    size: 60,
    cell: ({ row }) => {
      const j = row.original.j1939;
      if (!j) return <span style={styles.j1939Absent}>—</span>;
      return (
        <span className="mono" style={{
          color: j.is_broadcast ? 'var(--text-muted)' : 'var(--text-secondary)',
          fontSize: 11,
        }}>
          {j.is_broadcast ? 'BC' : j.da_hex}
        </span>
      );
    },
  },
];

// ── CANopen column definitions ────────────────────────────────────────────────

const CANOPEN_COLUMNS: ColumnDef<FrameRow>[] = [
  {
    id: 'co_type',
    header: 'Type',
    size: 80,
    cell: ({ row }) => {
      const co = row.original.canopen;
      if (!co) return <span style={styles.coAbsent}>—</span>;
      return (
        <span
          className="mono"
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.04em',
            color: canopenTypeColor(co.frame_type),
          }}
        >
          {co.frame_type}
        </span>
      );
    },
  },
  {
    id: 'co_node',
    header: 'Node',
    size: 50,
    cell: ({ row }) => {
      const co = row.original.canopen;
      if (!co || co.node_id === null) return <span style={styles.coAbsent}>—</span>;
      return (
        <span className="mono" style={{ fontSize: 11, color: 'var(--accent-amber)' }}>
          0x{co.node_id.toString(16).toUpperCase().padStart(2, '0')}
        </span>
      );
    },
  },
  {
    id: 'co_info',
    header: 'Protocol Info',
    size: 200,
    cell: ({ row }) => {
      const co = row.original.canopen;
      if (!co) return <span style={styles.coAbsent}>—</span>;
      const detail = canopenDetail(co);
      return (
        <span
          style={{
            fontSize: 11,
            color: co.frame_type === 'EMCY' ? 'var(--accent-red)' : 'var(--text-secondary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: 'block',
          }}
          title={detail}
        >
          {detail}
        </span>
      );
    },
  },
];
// ── Frames tab: toolbar + Monitor or Trace view ───────────────────────────────

export function MessageTable() {
  const view        = useFrameViewStore((s) => s.view);
  const paused      = useFrameViewStore((s) => s.paused);
  const setView     = useFrameViewStore((s) => s.setView);
  const togglePause = useFrameViewStore((s) => s.togglePause);

  return (
    <div style={styles.wrapper}>
      <div style={styles.toolbar}>
        <div className="seg">
          <button className={`seg-btn${view === 'monitor' ? ' active' : ''}`} onClick={() => setView('monitor')}
            title="One row per CAN ID, updated in place">
            Monitor
          </button>
          <button className={`seg-btn${view === 'trace' ? ' active' : ''}`} onClick={() => setView('trace')}
            title="Every frame in time order (last 10,000)">
            Trace
          </button>
        </div>
        <button className={`seg-btn solo${paused ? ' active warn' : ''}`} onClick={togglePause}
          title={paused ? 'Resume the live view' : 'Freeze the view -- frames are still received and recorded'}>
          {paused ? '▶ Resume' : '❚❚ Pause'}
        </button>
        {paused && <span style={styles.pausedNote}>view paused -- still receiving</span>}
      </div>
      {view === 'monitor' ? <MonitorTable /> : <TraceTable />}
    </div>
  );
}

function MonitorTable() {
  const liveList    = useFrameStore((s) => s.frameList);
  const paused      = useFrameViewStore((s) => s.paused);
  // Paused: keep showing the list as it was when the view was frozen
  const shownList   = useRef(liveList);
  if (!paused) shownList.current = liveList;
  const frameList   = shownList.current;
  const showDecoded = useFrameStore((s) => s.filter.showDecoded);
  const j1939Mode   = useJ1939Store((s) => s.mode);
  const canopenMode = useCANopenStore((s) => s.mode);

  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const toggleExpand = useCallback((id: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const rowRefs       = useRef<Map<number, HTMLDivElement>>(new Map());
  const prevFlashKeys = useRef<Map<number, number>>(new Map());

  useEffect(() => {
    for (const row of frameList) {
      const prev = prevFlashKeys.current.get(row.id);
      if (prev !== undefined && prev !== row.flashKey) {
        const el = rowRefs.current.get(row.id);
        if (el) triggerFlash(el, row.id);
      }
      prevFlashKeys.current.set(row.id, row.flashKey);
    }
  }, [frameList]);

  // Append protocol columns dynamically based on active decoders
  const columns = useMemo<ColumnDef<FrameRow>[]>(() => {
    let cols: ColumnDef<FrameRow>[] = [...BASE_COLUMNS];
    if (j1939Mode   === 'on') cols = [...cols, ...J1939_COLUMNS];
    if (canopenMode === 'on') cols = [...cols, ...CANOPEN_COLUMNS];
    return cols;
  }, [j1939Mode, canopenMode]);

  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(loadColumnSizing);

  useEffect(() => {
    try { localStorage.setItem(SIZING_KEY, JSON.stringify(columnSizing)); } catch { /* ignore */ }
  }, [columnSizing]);

  const table = useReactTable({
    data: frameList,
    columns,
    state: { columnSizing },
    onColumnSizingChange: setColumnSizing,
    columnResizeMode: 'onChange',
    defaultColumn: { minSize: MIN_COLUMN_WIDTH },
    getCoreRowModel: getCoreRowModel(),
  });

  const { rows } = table.getRowModel();
  const parentRef = useRef<HTMLDivElement>(null);

  const flatItems = useMemo(() => {
    const items: Array<
      | { type: 'row'; row: typeof rows[0] }
      | { type: 'signals'; frameId: number; signals: DecodedSignal[] }
    > = [];
    for (const row of rows) {
      items.push({ type: 'row', row });
      const frameId = row.original.id;
      if (expandedRows.has(frameId) && row.original.decodedSignals?.length) {
        items.push({ type: 'signals', frameId, signals: row.original.decodedSignals });
      }
    }
    return items;
  }, [rows, expandedRows]);

  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => parentRef.current,
    // Rows start below the sticky header inside the same scroll element
    scrollMargin: HEADER_HEIGHT,
    estimateSize: (i) => {
      const item = flatItems[i];
      if (item.type === 'signals') {
        return item.signals.length * SIGNAL_ROW_HEIGHT + 8;
      }
      return ROW_HEIGHT;
    },
    overscan: 20,
  });

  const isEmpty = frameList.length === 0;
  // The expand column is drawn separately with a fixed width
  const rowWidth = EXPAND_WIDTH + table.getTotalSize() - table.getColumn('expand')!.getSize();

  return (
    <div style={styles.inner}>
      {/* Header and virtualised body share one scroll element, so wide columns
          scroll horizontally together */}
      <div ref={parentRef} style={styles.body}>
        <div style={{ ...styles.header, minWidth: rowWidth }}>
          {table.getHeaderGroups().map((hg) => (
            <div key={hg.id} style={styles.headerRow}>
              <div style={{ ...styles.headerCell, width: EXPAND_WIDTH, flexShrink: 0 }} />
              {hg.headers.slice(1).map((header, i, all) => (
                <div
                  key={header.id}
                  style={{
                    ...styles.headerCell,
                    width: header.getSize(),
                    flexShrink: 0,
                    // The last column takes the rest of the row
                    flexGrow: i === all.length - 1 ? 1 : 0,
                  }}
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                  <div
                    style={{
                      ...styles.resizer,
                      background: header.column.getIsResizing() ? 'var(--accent-green)' : undefined,
                    }}
                    onMouseDown={header.getResizeHandler()}
                    onTouchStart={header.getResizeHandler()}
                    onDoubleClick={() => header.column.resetSize()}
                    title="Drag to resize, double-click to reset"
                  />
                </div>
              ))}
            </div>
          ))}
        </div>

        {isEmpty ? (
          <div style={styles.empty}>
            <span style={styles.emptyIcon}>◈</span>
            <span style={styles.emptyText}>No frames received</span>
            <span style={styles.emptyHint}>Connect to a CAN bus to start streaming</span>
          </div>
        ) : (
          <div
            style={{
              height: virtualizer.getTotalSize(),
              minWidth: rowWidth,
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((vi) => {
              const item = flatItems[vi.index];

              if (item.type === 'signals') {
                return (
                  <div
                    key={`sig-${item.frameId}`}
                    style={{
                      position: 'absolute',
                      top: vi.start - HEADER_HEIGHT,
                      width: '100%',
                      height: vi.size,
                    }}
                  >
                    <SignalRows signals={item.signals} />
                  </div>
                );
              }

              const { row } = item;
              const frame = row.original;
              const isExpanded = expandedRows.has(frame.id);
              const hasSignals = (frame.decodedSignals?.length ?? 0) > 0;
              const cells = row.getVisibleCells().slice(1);

              return (
                <div
                  key={row.id}
                  ref={(el) => {
                    if (el) rowRefs.current.set(frame.id, el);
                    else rowRefs.current.delete(frame.id);
                  }}
                  style={{
                    position: 'absolute',
                    top: vi.start - HEADER_HEIGHT,
                    width: '100%',
                    height: ROW_HEIGHT,
                    display: 'flex',
                    alignItems: 'center',
                    cursor: hasSignals ? 'pointer' : 'default',
                    borderBottom: '1px solid var(--border-subtle)',
                  }}
                  onClick={() => hasSignals && toggleExpand(frame.id)}
                >
                  {/* Expand toggle */}
                  <div style={styles.expandCell}>
                    {hasSignals && (
                      <span style={{
                        ...styles.expandIcon,
                        transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                      }}>
                        ▶
                      </span>
                    )}
                  </div>

                  {/* Data cells -- the last one takes the rest of the row and holds the badges */}
                  {cells.map((cell, i) => i < cells.length - 1 ? (
                    <div key={cell.id} style={{ ...styles.cell, width: cell.column.getSize() }}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </div>
                  ) : (
                    <div key={cell.id} style={{ ...styles.lastCell, width: cell.column.getSize() }}>
                      <div style={styles.lastCellContent}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </div>
                      <div style={styles.badgeArea}>
                        {frame.j1939?.is_bam_cm && (
                          <span className="badge badge-blue" title="BAM Connection Management">BAM CM</span>
                        )}
                        {frame.j1939?.is_bam_dt && (
                          <span className="badge badge-muted" title="BAM Data Transfer">BAM DT</span>
                        )}
                        {frame.j1939?.dm1_faults && frame.j1939.dm1_faults.length > 0 && (
                          <span className="badge badge-red" title="Active Diagnostic Trouble Codes">
                            DM1 ({frame.j1939.dm1_faults.length})
                          </span>
                        )}
                        {frame.canopen?.frame_type === 'EMCY' && (
                          <span className="badge badge-red" title={frame.canopen.emcy?.error_name ?? 'Emergency'}>
                            EMCY
                          </span>
                        )}
                        {frame.canopen?.sdo_transaction && (
                          <span
                            className="badge badge-green"
                            title={frame.canopen.sdo_transaction.object_name ?? 'SDO paired'}
                          >
                            SDO
                          </span>
                        )}
                        {/* EXT badge: only for extended-ID frames that are not J1939 or CANopen */}
                        {frame.isExtended && !frame.j1939 && !frame.canopen && (
                          <span className="badge badge-muted">EXT</span>
                        )}
                        {frame.isRemote && (
                          <span className="badge badge-amber" title="Remote transmission request">RTR</span>
                        )}
                        {frame.isFd && <span className="badge badge-blue">FD</span>}
                        {showDecoded && frame.decodedSignals?.length ? (
                          <span className="badge badge-green">DBC</span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    background: 'var(--bg-base)',
  },
  inner: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    height: 32,
    flexShrink: 0,
    padding: '0 8px',
    borderBottom: '1px solid var(--border-subtle)',
    background: 'var(--bg-panel)',
  },
  pausedNote: {
    fontSize: 11,
    color: 'var(--accent-amber)',
  },
  header: {
    position: 'sticky',
    top: 0,
    zIndex: 1,
    background: 'var(--bg-panel)',
    borderBottom: '1px solid var(--border-subtle)',
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    height: HEADER_HEIGHT,
  },
  headerCell: {
    position: 'relative',
    alignSelf: 'stretch',
    display: 'flex',
    alignItems: 'center',
    paddingLeft: 8,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    userSelect: 'none',
  },
  cell: {
    flexShrink: 0,
    paddingLeft: 8,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
  resizer: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 5,
    height: '100%',
    cursor: 'col-resize',
    userSelect: 'none',
    touchAction: 'none',
    borderRight: '1px solid var(--border-subtle)',
  },
  body: {
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
  },
  expandCell: {
    width: EXPAND_WIDTH,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandIcon: {
    fontSize: 8,
    color: 'var(--text-muted)',
    transition: 'transform 150ms ease',
    display: 'inline-block',
  },
  lastCell: {
    flex: '1 0 auto',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 8,
    minWidth: 0,
  },
  lastCellContent: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
  badgeArea: {
    display: 'flex',
    flexShrink: 0,
    gap: 4,
    paddingRight: 10,
  },
  idCell: {
    fontWeight: 600,
    fontSize: 12,
    color: 'var(--accent-green)',
  },
  dataCell: {
    fontSize: 11,
    color: 'var(--text-primary)',
    letterSpacing: '0.04em',
  },
  timeCell: {
    fontSize: 10,
    color: 'var(--text-muted)',
  },
  j1939Absent: {
    color: 'var(--text-muted)',
    fontSize: 12,
  },
  coAbsent: {
    color: 'var(--text-muted)',
    fontSize: 12,
  },
  pgnName: {
    fontSize: 11,
    color: 'var(--text-secondary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    display: 'block',
  },
  saCell: {
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
  },
  saName: {
    fontSize: 9,
    color: 'var(--text-muted)',
    lineHeight: 1,
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: 8,
    paddingTop: 80,
  },
  emptyIcon: {
    fontSize: 32,
    color: 'var(--text-muted)',
    opacity: 0.4,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: 500,
    color: 'var(--text-secondary)',
  },
  emptyHint: {
    fontSize: 12,
    color: 'var(--text-muted)',
  },
  signalContainer: {
    paddingLeft: 30,
    paddingRight: 10,
    background: 'var(--bg-elevated)',
    borderBottom: '1px solid var(--border-subtle)',
  },
  signalRow: {
    display: 'flex',
    alignItems: 'center',
    height: SIGNAL_ROW_HEIGHT,
    gap: 8,
  },
  signalName: {
    fontSize: 11,
    color: 'var(--text-secondary)',
    fontFamily: 'var(--font-mono)',
    flex: 1,
  },
  signalValue: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--accent-green)',
    textAlign: 'right',
    minWidth: 60,
  },
  signalUnit: {
    fontSize: 10,
    color: 'var(--text-muted)',
    minWidth: 30,
  },
};
