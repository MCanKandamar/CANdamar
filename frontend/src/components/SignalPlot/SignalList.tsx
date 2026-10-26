/**
 * SignalList.tsx
 * --------------
 * Left-hand list of the Plot tab: every signal that has received values,
 * grouped by where it comes from (DBC, CANopen PDO, SDO, Custom). Ticking a
 * signal plots it. Empty groups explain how to fill them. The gear opens a
 * display scale / unit editor; millivolt signals get a one-click "→V".
 */

import { useEffect, useState } from 'react';
import {
  usePlotStore, SIGNAL_COLORS, MAX_SIGNALS, getLatestValue, signalSource, displayUnit,
  isMillivolt, type SignalSource,
} from '../../store/plotStore';
import { useCustomSignalStore, customSignalKey } from '../../store/customSignalStore';
import { useSdoPollStore, polledKey } from '../../store/sdoPollStore';

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

const MILLIVOLT_TO_VOLT = { scale: 0.001, unit: 'V' };

function ScaleEditor({ signalKey, onClose }: { signalKey: string; onClose: () => void }) {
  const current        = usePlotStore((s) => s.signalScales[signalKey]);
  const sourceUnit     = usePlotStore((s) => s.signalUnits[signalKey] ?? '');
  const setSignalScale = usePlotStore((s) => s.setSignalScale);
  const [scale, setScale] = useState(String(current?.scale ?? 1));
  const [unit,  setUnit]  = useState(current?.unit ?? sourceUnit);

  const num   = parseFloat(scale);
  const valid = Number.isFinite(num) && num !== 0;

  return (
    <div style={styles.editor}>
      <span style={styles.editorLabel}>×</span>
      <input style={{ ...styles.editorInput, width: 64 }} value={scale}
        onChange={(e) => setScale(e.target.value)} title="Scale: displayed value = received value × scale" />
      <input style={{ ...styles.editorInput, width: 44 }} value={unit}
        onChange={(e) => setUnit(e.target.value)} placeholder="unit" title="Unit shown with the value" />
      <button className="btn btn-primary btn-sm" style={styles.editorBtn} disabled={!valid}
        onClick={() => { setSignalScale(signalKey, { scale: num, unit }); onClose(); }}>
        OK
      </button>
      <button className="btn btn-ghost btn-sm" style={styles.editorBtn}
        title="Back to the received value and unit"
        onClick={() => { setSignalScale(signalKey, null); onClose(); }}>
        Reset
      </button>
    </div>
  );
}

export function SignalList() {
  const availableSignals = usePlotStore((s) => s.availableSignals);
  const selectedSignals  = usePlotStore((s) => s.selectedSignals);
  const signalUnits      = usePlotStore((s) => s.signalUnits);
  const signalScales     = usePlotStore((s) => s.signalScales);
  const toggleSignal     = usePlotStore((s) => s.toggleSignal);
  const setSignalScale   = usePlotStore((s) => s.setSignalScale);
  const polled           = useSdoPollStore((s) => s.objects);
  const pollError        = useSdoPollStore((s) => s.error);
  const stopPoll         = useSdoPollStore((s) => s.stop);
  const [editing, setEditing] = useState<string | null>(null);
  const polledKeys = new Set(polled.map(polledKey));
  const customSignals    = useCustomSignalStore((s) => s.signals);

  // Re-render twice a second so the latest values stay current
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), REFRESH_MS);
    return () => clearInterval(t);
  }, []);

  // Custom signals and polled SDO objects are listed before the first value
  const keys = [...availableSignals];
  for (const key of [...customSignals.map((sig) => customSignalKey(sig.name)), ...polledKeys]) {
    if (!keys.includes(key)) keys.push(key);
  }

  const full = selectedSignals.length >= MAX_SIGNALS;

  return (
    <div style={styles.root}>
      {GROUPS.map((g) => {
        const groupKeys = keys.filter((k) => signalSource(k) === g.id).sort();
        return (
          <div key={g.id} style={styles.group}>
            <div className="section-label" style={styles.groupHead}>
              {g.label}
              {groupKeys.length > 0 && <span style={styles.count}>{groupKeys.length}</span>}
            </div>
            {groupKeys.length === 0 && <div className="hint-text" style={styles.hint}>{g.hint}</div>}
            {g.id === 'sdo' && polled.length > 0 && pollError && (
              <div style={styles.error} title={pollError}>Read failed: {pollError}</div>
            )}
            {groupKeys.map((key) => {
              const si       = selectedSignals.indexOf(key);
              const selected = si !== -1;
              const disabled = !selected && full;
              const unit     = displayUnit(key, signalScales, signalUnits);
              const suggestV = !signalScales[key] && isMillivolt(key, unit);
              return (
                <div key={key}>
                  <div style={styles.row}>
                    <label
                      style={{ ...styles.rowLabel, opacity: disabled ? 0.5 : 1 }}
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
                    </label>
                    <span style={styles.value} className="mono">
                      {formatValue(getLatestValue(key))}
                      {unit && <span style={styles.unit}> {unit}</span>}
                    </span>
                    {polledKeys.has(key) && (
                      <button style={styles.stop} title="Read by SDO every 100 ms -- click to stop"
                        onClick={() => stopPoll(key)}>
                        ■
                      </button>
                    )}
                    {suggestV && (
                      <button style={styles.suggest} title="Show in volts (× 0.001)"
                        onClick={() => setSignalScale(key, MILLIVOLT_TO_VOLT)}>
                        →V
                      </button>
                    )}
                    <button
                      style={{ ...styles.gear, color: signalScales[key] ? 'var(--accent-green)' : undefined }}
                      title="Display scale and unit"
                      onClick={() => setEditing(editing === key ? null : key)}
                    >
                      ⚙
                    </button>
                  </div>
                  {editing === key && <ScaleEditor signalKey={key} onClose={() => setEditing(null)} />}
                </div>
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
    marginBottom: 4,
  },
  count: {
    fontSize: 'var(--fs-xs)',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-default)',
    borderRadius: 8,
    padding: '0 5px',
    letterSpacing: 0,
  },
  hint: {
    paddingLeft: 2,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    height: 22,
    fontSize: 11,
  },
  rowLabel: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    cursor: 'pointer',
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
  error: {
    fontSize: 'var(--fs-xs)',
    color: 'var(--accent-red)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    marginBottom: 2,
  },
  stop: {
    flexShrink: 0,
    background: 'none',
    border: 'none',
    color: 'var(--accent-amber)',
    fontSize: 'var(--fs-xs)',
    lineHeight: 1,
    padding: '0 2px',
    cursor: 'pointer',
  },
  suggest: {
    flexShrink: 0,
    background: 'none',
    border: '1px dashed var(--accent-amber)',
    borderRadius: 3,
    color: 'var(--accent-amber)',
    fontSize: 'var(--fs-xs)',
    lineHeight: 1,
    padding: '1px 3px',
    cursor: 'pointer',
  },
  gear: {
    flexShrink: 0,
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    fontSize: 11,
    lineHeight: 1,
    padding: '0 2px',
    cursor: 'pointer',
  },
  editor: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px 0 6px 18px',
  },
  editorLabel: {
    fontSize: 11,
    color: 'var(--text-muted)',
  },
  editorInput: {
    background: 'var(--bg-panel)',
    border: '1px solid var(--border-default)',
    borderRadius: 3,
    color: 'var(--text-primary)',
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    padding: '1px 4px',
  },
  editorBtn: {
    fontSize: 10,
    padding: '1px 6px',
  },
};
