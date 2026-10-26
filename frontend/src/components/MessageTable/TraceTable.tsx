/**
 * TraceTable.tsx
 * --------------
 * Trace view of the Frames tab: every frame in arrival order (the last
 * 10,000, see frameStore's trace buffer), newest at the bottom. The view
 * follows new frames while it is scrolled to the end; scrolling up stops
 * following. The ID filter of the sidebar applies here too.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  useFrameStore, traceSnapshot, traceVersion, traceStart, parseIdFilter, TRACE_MAX,
  type TraceRow,
} from '../../store/frameStore';
import { useFrameViewStore, formatByte } from '../../store/frameViewStore';
import { useDensityStore } from '../../store/densityStore';
import { canopenDetail, canopenTypeColor } from '../../utils/canopenDisplay';

const ROW_HEIGHT = { comfortable: 22, compact: 18 };
const REFRESH_MS = 250;

/** Protocol text for the Info column. */
function infoOf(row: TraceRow): { text: string; color?: string } {
  const co = row.canopen;
  if (co) {
    const node = co.node_id !== null ? ` 0x${co.node_id.toString(16).toUpperCase().padStart(2, '0')}` : '';
    return { text: `${co.frame_type}${node}  ${canopenDetail(co)}`, color: canopenTypeColor(co.frame_type) };
  }
  if (row.j1939) return { text: `PGN ${row.j1939.pgn_hex} ${row.j1939.pgn_name}  SA ${row.j1939.sa_hex}` };
  if (row.decodedSignals?.length) {
    return {
      text: row.decodedSignals
        .map((s) => `${s.name}=${typeof s.value === 'number' ? +s.value.toFixed(3) : s.value}${s.unit ? ' ' + s.unit : ''}`)
        .join('  '),
    };
  }
  return { text: '' };
}

export function TraceTable() {
  const paused = useFrameViewStore((s) => s.paused);
  const radix  = useFrameViewStore((s) => s.radix);
  const idText = useFrameStore((s) => s.filter.idText);
  const rowHeight = ROW_HEIGHT[useDensityStore((s) => s.density)];

  const [rows, setRows] = useState<TraceRow[]>(traceSnapshot);
  const parentRef = useRef<HTMLDivElement>(null);
  const follow    = useRef(true);

  // Copy the trace buffer out a few times a second while not paused
  useEffect(() => {
    if (paused) return;
    let shown = -1;
    const tick = () => {
      const v = traceVersion();
      if (v !== shown) {
        shown = v;
        setRows(traceSnapshot());
      }
    };
    tick();
    const t = setInterval(tick, REFRESH_MS);
    return () => clearInterval(t);
  }, [paused]);

  const shown = useMemo(() => {
    const { min, max } = parseIdFilter(idText);
    return min === undefined || max === undefined
      ? rows
      : rows.filter((r) => r.id >= min && r.id <= max);
  }, [rows, idText]);

  const virtualizer = useVirtualizer({
    count: shown.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 30,
  });

  // Row height changed (density): drop the cached row positions
  useEffect(() => { virtualizer.measure(); }, [rowHeight, virtualizer]);

  // Keep the newest frame in view while following
  useEffect(() => {
    if (follow.current && shown.length > 0) virtualizer.scrollToIndex(shown.length - 1, { align: 'end' });
  }, [shown, virtualizer]);

  const onScroll = () => {
    const el = parentRef.current;
    if (el) follow.current = el.scrollTop + el.clientHeight >= el.scrollHeight - rowHeight * 2;
  };

  const t0 = traceStart();

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <span className="section-label" style={{ ...styles.headCell, width: 50 }}>#</span>
        <span className="section-label" style={{ ...styles.headCell, width: 90 }}>Time (s)</span>
        <span className="section-label" style={{ ...styles.headCell, width: 90 }}>ID</span>
        <span className="section-label" style={{ ...styles.headCell, width: 36 }}>DLC</span>
        <span className="section-label" style={{ ...styles.headCell, width: 200 }}>Data</span>
        <span className="section-label" style={{ ...styles.headCell, flex: 1 }}>Info</span>
        <span style={styles.count}>{shown.length.toLocaleString()} / {TRACE_MAX.toLocaleString()}</span>
      </div>
      <div ref={parentRef} style={styles.body} onScroll={onScroll}>
        {shown.length === 0 ? (
          <div style={styles.empty}>No frames yet -- the trace keeps the last {TRACE_MAX.toLocaleString()} frames</div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((vi) => {
              const r = shown[vi.index];
              const info = infoOf(r);
              return (
                <div key={r.seq} style={{ ...styles.row, top: vi.start, height: rowHeight }}>
                  <span className="mono" style={{ ...styles.cell, width: 50, color: 'var(--text-muted)' }}>{r.seq}</span>
                  <span className="mono" style={{ ...styles.cell, width: 90, color: 'var(--text-secondary)' }}
                    title={new Date(r.timeMs).toTimeString().slice(0, 8)}>
                    {((r.timeMs - t0) / 1000).toFixed(3)}
                  </span>
                  <span className="mono" style={{ ...styles.cell, width: 90, color: 'var(--accent-green)', fontWeight: 600 }}>
                    {r.idHex}
                  </span>
                  <span className="mono" style={{ ...styles.cell, width: 36, color: 'var(--text-secondary)' }}>{r.dlc}</span>
                  <span className="mono" style={{ ...styles.cell, width: 200, whiteSpace: 'pre' }}>
                    {r.isRemote
                      ? <span style={{ color: 'var(--text-muted)' }}>remote request</span>
                      : radix === 'hex' ? r.dataHex : r.data.map((b) => formatByte(b, radix)).join(' ')}
                  </span>
                  <span style={{ ...styles.cell, flex: 1, color: info.color ?? 'var(--text-secondary)' }} title={info.text}>
                    {info.text}
                  </span>
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
  root: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    height: 26,
    flexShrink: 0,
    paddingLeft: 8,
    background: 'var(--bg-panel)',
    borderBottom: '1px solid var(--border-subtle)',
  },
  headCell: {
    flexShrink: 0,
  },
  count: {
    fontSize: 'var(--fs-xs)',
    color: 'var(--text-muted)',
    paddingRight: 10,
  },
  body: {
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
  },
  row: {
    position: 'absolute',
    left: 0,
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    paddingLeft: 8,
    borderBottom: '1px solid var(--border-subtle)',
    fontSize: 'var(--fs-sm)',
  },
  cell: {
    flexShrink: 0,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    paddingRight: 8,
  },
  empty: {
    padding: '40px 0',
    textAlign: 'center',
    fontSize: 'var(--fs-md)',
    color: 'var(--text-muted)',
  },
};
