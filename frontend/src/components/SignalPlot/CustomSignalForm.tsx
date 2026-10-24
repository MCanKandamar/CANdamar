/**
 * CustomSignalForm.tsx
 * --------------------
 * Inline editor for DBC-less plot signals (see customSignalStore.ts).
 * Pick a CAN ID, start byte, type, byte order and scale/offset; the signal
 * is added to the plot right away and decoded from every matching frame.
 * A live preview shows the value decoded from the latest frame, so a wrong
 * byte order or start byte is obvious before plotting.
 */

import { useState } from 'react';
import {
  useCustomSignalStore, CUSTOM_SIGNAL_TYPES, customSignalKey, decodeCustomSignal, typeSize,
} from '../../store/customSignalStore';
import type { CustomSignal, CustomSignalType } from '../../store/customSignalStore';
import { usePlotStore, MAX_SIGNALS } from '../../store/plotStore';
import { useFrameStore } from '../../store/frameStore';

const s: Record<string, React.CSSProperties> = {
  box: {
    marginBottom: 10,
    padding: '8px 10px',
    background: 'var(--bg-panel)',
    border: '1px solid var(--border-default)',
    borderRadius: 6,
  },
  row:   { display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' },
  group: { display: 'flex', flexDirection: 'column', gap: 2 },
  label: { fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' },
  input: {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-default)',
    borderRadius: 4,
    padding: '3px 6px',
    color: 'var(--text-primary)',
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    outline: 'none',
  },
  btn: {
    background: 'none',
    border: '1px solid var(--border-default)',
    borderRadius: 4,
    color: 'var(--text-secondary)',
    fontSize: 11,
    fontFamily: 'monospace',
    padding: '3px 8px',
    cursor: 'pointer',
  },
  hint:  { fontSize: 11, fontFamily: 'var(--font-mono)', marginTop: 6 },
  item: {
    display: 'flex', alignItems: 'center', gap: 8,
    fontSize: 11, fontFamily: 'var(--font-mono)', padding: '2px 0',
  },
};

function parseId(text: string): number | null {
  const t = text.trim().replace(/^0x/i, '');
  if (!/^[0-9a-f]{1,8}$/i.test(t)) return null;
  const v = parseInt(t, 16);
  return v <= 0x1FFFFFFF ? v : null;
}

const idHex = (id: number) => '0x' + id.toString(16).toUpperCase().padStart(id > 0x7FF ? 8 : 3, '0');

function describe(sig: CustomSignal): string {
  const type = CUSTOM_SIGNAL_TYPES.find((t) => t.id === sig.type)!.label;
  const bytes = typeSize(sig.type) > 1 ? ` ${sig.littleEndian ? 'LE' : 'BE'}` : '';
  return `${idHex(sig.id)} · byte ${sig.startByte} · ${type}${bytes} · ×${sig.scale} ${sig.offset >= 0 ? '+' : '-'}${Math.abs(sig.offset)}`;
}

export function CustomSignalForm({ onClose }: { onClose: () => void }) {
  const signals         = useCustomSignalStore((x) => x.signals);
  const addSignal       = useCustomSignalStore((x) => x.add);
  const removeSignal    = useCustomSignalStore((x) => x.remove);
  const selectedSignals = usePlotStore((x) => x.selectedSignals);
  const toggleSignal    = usePlotStore((x) => x.toggleSignal);
  const forgetSignal    = usePlotStore((x) => x.forgetSignal);

  const [name,   setName]   = useState('');
  const [idText, setIdText] = useState('');
  const [start,  setStart]  = useState('0');
  const [type,   setType]   = useState<CustomSignalType>('u16');
  const [le,     setLe]     = useState(true);
  const [scale,  setScale]  = useState('1');
  const [offset, setOffset] = useState('0');

  // IDs seen so far, as suggestions -- a snapshot, so the form does not
  // re-render on every received frame
  const [seenIds] = useState(() =>
    Array.from(useFrameStore.getState().frames.keys()).sort((a, b) => a - b));

  const id        = parseId(idText);
  const startByte = Number(start);
  const size      = typeSize(type);
  const scaleNum  = Number(scale);
  const offsetNum = Number(offset);

  let error: string | null = null;
  if (idText.trim() && id === null)                         error = 'CAN ID must be hex, up to 0x1FFFFFFF';
  else if (!Number.isInteger(startByte) || startByte < 0)   error = 'Start byte must be 0-7';
  else if (startByte + size > 8)                            error = `${size} bytes from byte ${startByte} run past byte 7`;
  else if (!Number.isFinite(scaleNum) || scale.trim() === '') error = 'Scale must be a number';
  else if (!Number.isFinite(offsetNum) || offset.trim() === '') error = 'Offset must be a number';

  const finalName = name.trim() || (id !== null ? `${idHex(id)}_b${startByte}` : '');
  const draft: CustomSignal | null = id !== null && !error
    ? { name: finalName, id, startByte, type, littleEndian: le, scale: scaleNum, offset: offsetNum }
    : null;

  // Live preview from the most recent frame with this ID
  const latest  = useFrameStore((x) => (id !== null ? x.frames.get(id) : undefined));
  const preview = draft && latest ? decodeCustomSignal(draft, latest.data) : null;

  const handleAdd = () => {
    if (!draft) return;
    const key = customSignalKey(draft.name);
    // Redefining a signal: drop samples decoded with the old definition
    if (signals.some((x) => x.name === draft.name)) forgetSignal(key);
    addSignal(draft);
    const sel = usePlotStore.getState().selectedSignals;
    if (!sel.includes(key) && sel.length < MAX_SIGNALS) toggleSignal(key);
  };

  const handleEdit = (sig: CustomSignal) => {
    setName(sig.name);
    setIdText(idHex(sig.id));
    setStart(String(sig.startByte));
    setType(sig.type);
    setLe(sig.littleEndian);
    setScale(String(sig.scale));
    setOffset(String(sig.offset));
  };

  const handleRemove = (sig: CustomSignal) => {
    removeSignal(sig.name);
    forgetSignal(customSignalKey(sig.name));
  };

  return (
    <div style={s.box}>
      <div style={s.row}>
        <div style={s.group}>
          <span style={s.label}>CAN ID (hex)</span>
          <input style={{ ...s.input, width: 90 }} value={idText} list="canviz-seen-ids"
            onChange={(e) => setIdText(e.target.value)} placeholder="0x18D" />
          <datalist id="canviz-seen-ids">
            {seenIds.map((x) => <option key={x} value={idHex(x)} />)}
          </datalist>
        </div>
        <div style={s.group}>
          <span style={s.label}>Start byte</span>
          <select style={s.input} value={start} onChange={(e) => setStart(e.target.value)}>
            {[0, 1, 2, 3, 4, 5, 6, 7].map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div style={s.group}>
          <span style={s.label}>Type</span>
          <select style={s.input} value={type} onChange={(e) => setType(e.target.value as CustomSignalType)}>
            {CUSTOM_SIGNAL_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <div style={s.group}>
          <span style={s.label}>Byte order</span>
          <select style={s.input} value={le ? 'le' : 'be'} disabled={size === 1}
            onChange={(e) => setLe(e.target.value === 'le')}>
            <option value="le">Little-endian (Intel)</option>
            <option value="be">Big-endian (Motorola)</option>
          </select>
        </div>
        <div style={s.group}>
          <span style={s.label}>Scale</span>
          <input style={{ ...s.input, width: 70 }} value={scale} onChange={(e) => setScale(e.target.value)} />
        </div>
        <div style={s.group}>
          <span style={s.label}>Offset</span>
          <input style={{ ...s.input, width: 60 }} value={offset} onChange={(e) => setOffset(e.target.value)} />
        </div>
        <div style={s.group}>
          <span style={s.label}>Name</span>
          <input style={{ ...s.input, width: 120 }} value={name}
            onChange={(e) => setName(e.target.value)} placeholder={finalName || 'auto'} />
        </div>
        <button style={{ ...s.btn, color: draft ? 'var(--accent-green)' : undefined, borderColor: draft ? 'var(--accent-green)' : undefined }}
          onClick={handleAdd} disabled={!draft}>
          {signals.some((x) => x.name === finalName) ? 'Update' : 'Add & plot'}
        </button>
        <button style={s.btn} onClick={onClose}>Close</button>
      </div>

      {/* Validation error or live preview */}
      {error ? (
        <div style={{ ...s.hint, color: 'var(--accent-red)' }}>{error}</div>
      ) : draft && (
        <div style={{ ...s.hint, color: 'var(--text-secondary)' }}>
          {latest
            ? <>latest {idHex(draft.id)} [{latest.dataHex}] → <span style={{ color: 'var(--accent-green)' }}>
                {preview !== null ? +preview.toPrecision(7) : `frame has only ${latest.data.length} bytes`}
              </span></>
            : `no frame with ID ${idHex(draft.id)} received yet`}
        </div>
      )}

      {/* Existing custom signals */}
      {signals.length > 0 && (
        <div style={{ marginTop: 8, borderTop: '1px solid var(--border-subtle)', paddingTop: 6 }}>
          {signals.map((sig) => {
            const key = customSignalKey(sig.name);
            const plotted = selectedSignals.includes(key);
            return (
              <div key={sig.name} style={s.item}>
                <span style={{ color: 'var(--text-primary)', cursor: 'pointer' }}
                  onClick={() => handleEdit(sig)} title="Edit">
                  {key}
                </span>
                <span style={{ color: 'var(--text-muted)' }}>{describe(sig)}</span>
                <div style={{ flex: 1 }} />
                <button style={s.btn} onClick={() => toggleSignal(key)}
                  disabled={!plotted && selectedSignals.length >= MAX_SIGNALS}>
                  {plotted ? 'hide' : 'plot'}
                </button>
                <button style={{ ...s.btn, color: 'var(--accent-red)' }} onClick={() => handleRemove(sig)}
                  title={`Delete ${key}`}>×</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
