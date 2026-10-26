/**
 * SignalList.tsx
 * --------------
 * Left-hand list of the Plot tab: every signal that has received values,
 * grouped by where it comes from (DBC, CANopen PDO, SDO, Custom). Ticking a
 * signal plots it. Empty groups explain how to fill them.
 */

import { useEffect, useState } from 'react';
import {
  usePlotStore, SIGNAL_COLORS, MAX_SIGNALS, getLatestValue, signalSource,
  type SignalSource,
} from '../../store/plotStore';
import { useCustomSignalStore, customSignalKey } from '../../store/customSignalStore';

const GROUPS: { id: SignalSource; label: string; hint: string }[] = [
  { id: 'dbc',    label: 'DBC',          hint: 'Load a DBC file in the sidebar; signals appear when their frames arrive.' },
  { id: 'pdo',    label: 'CANopen PDO',  hint: 'Load the node EDS in the CANopen tab; mapped TPDO values appear here.' },
  { id: 'sdo',    label: 'SDO',          hint: 'Values of SDO reads on the bus, or press Plot in the EDS object list.' },
  { id: 'custom', label: 'Custom',       hint: 'Use "+ custom signal" to plot raw bytes of any CAN ID.' },
];

const REFRESH_MS = 500;

/** Name without the source prefix: "SDO 0x0D.Vdc mV" -> "0x0D · Vdc mV". */
function shortName(key: string, source: SignalSource): string {
  const dot = key.indexOf('.');
  if (source === 'custom') return key.slice(dot + 1);
  if (source === 'pdo' || source === 'sdo') {
    return `${key.slice(key.indexOf(' ') + 1, dot)} · ${key.slice(dot + 1)}`;
  }
  return key;
}

function formatValue(v: number | null): string {
  if (v === null) return '--';
  if (Number.isInteger(v)) return String(v);
  return Math.abs(v) >= 1000 ? v.toFixed(1) : v.toPrecision(4);
}

export function SignalList() {
  const availableSignals = usePlotStore((s) => s.availableSignals);
  const selectedSignals  = usePlotStore((s) => s.selectedSignals);
  const signalUnits      = usePlotStore((s) => s.signalUnits);
  const toggleSignal     = usePlotStore((s) => s.toggleSignal);
  const customSignals    = useCustomSignalStore((s) => s.signals);

  // Re-render twice a second so the latest values stay current
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), REFRESH_MS);
    return () => clearInterval(t);
  }, []);

  // Custom signals are listed as soon as they are defined, before any frame
  const keys = [...availableSignals];
  for (const sig of customSignals) {
    const key = customSignalKey(sig.name);
    if (!keys.includes(key)) keys.push(key);
  }

  const full = selectedSignals.length >= MAX_SIGNALS;

  return (
    <div style={styles.root}>
      {GROUPS.map((g) => {
        const groupKeys = keys.filter((k) => signalSource(k) === g.id).sort();
        return (
          <div key={g.id} style={styles.group}>
            <div style={styles.groupHead}>
              {g.label}
              {groupKeys.length > 0 && <span style={styles.count}>{groupKeys.length}</span>}
            </div>
            {groupKeys.length === 0 && <div style={styles.hint}>{g.hint}</div>}
            {groupKeys.map((key) => {
              const si       = selectedSignals.indexOf(key);
              const selected = si !== -1;
              const disabled = !selected && full;
              return (
                <label
                  key={key}
                  style={{ ...styles.row, opacity: disabled ? 0.5 : 1 }}
                  title={disabled ? `At most ${MAX_SIGNALS} signals can be plotted` : key}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={disabled}
                    onChange={() => toggleSignal(key)}
                    style={styles.checkbox}
                  />
                  <span style={{
                    ...styles.dot,
                    background: selected ? SIGNAL_COLORS[si % SIGNAL_COLORS.length] : 'transparent',
                  }} />
                  <span style={styles.name}>{shortName(key, g.id)}</span>
                  <span style={styles.value} className="mono">
                    {formatValue(getLatestValue(key))}
                    {signalUnits[key] && <span style={styles.unit}> {signalUnits[key]}</span>}
                  </span>
                </label>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    width: 230,
    flexShrink: 0,
    overflowY: 'auto',
    borderRight: '1px solid var(--border-subtle)',
    paddingRight: 8,
    marginRight: 12,
  },
  group: {
    marginBottom: 10,
  },
  groupHead: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    marginBottom: 4,
  },
  count: {
    fontSize: 10,
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-default)',
    borderRadius: 8,
    padding: '0 5px',
    letterSpacing: 0,
  },
  hint: {
    fontSize: 11,
    color: 'var(--text-muted)',
    lineHeight: 1.4,
    paddingLeft: 2,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    height: 22,
    cursor: 'pointer',
    fontSize: 11,
  },
  checkbox: {
    margin: 0,
    flexShrink: 0,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    flexShrink: 0,
  },
  name: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-primary)',
  },
  value: {
    flexShrink: 0,
    fontSize: 11,
    color: 'var(--text-secondary)',
  },
  unit: {
    color: 'var(--text-muted)',
  },
};
