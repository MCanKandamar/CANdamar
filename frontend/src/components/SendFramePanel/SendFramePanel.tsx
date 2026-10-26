import { useEffect, useRef, useState } from 'react';
import { useConnectionStore } from '../../store/connectionStore';
import { useSendFrameStore } from '../../store/sendFrameStore';
import { useCANopenStore } from '../../store/canopenStore';
import { CANOPEN_TEMPLATES } from '../../utils/canopenTemplates';

const DLC_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8];

function rateLabel(ms: number): string {
  if (ms <= 0) return '';
  const hz = 1000 / ms;
  return hz >= 1 ? `${hz % 1 === 0 ? hz : hz.toFixed(1)} Hz` : `${(1 / hz).toFixed(1)} s`;
}

/** Save / load the list and add CANopen templates for a node */
function ListToolbar() {
  const exportList = useSendFrameStore((s) => s.exportList);
  const importList = useSendFrameStore((s) => s.importList);
  const addFrame   = useSendFrameStore((s) => s.addFrame);
  const firstNode  = useCANopenStore((s) => s.nodes[0]?.node_id);

  const [node, setNode]       = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Node for templates: what the user typed, else the first node seen on the bus
  const nodeId = parseInt(node) || firstNode || 1;

  const save = () => {
    const blob = new Blob([exportList()], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'candamar-send-list.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const load = async (file: File | undefined) => {
    if (!file) return;
    const error = importList(await file.text());
    setMessage(error ?? `Loaded ${file.name}`);
  };

  const addTemplate = (i: number) => {
    const t = CANOPEN_TEMPLATES[i];
    if (!t) return;
    addFrame({ name: `${t.label} -- node ${nodeId}`, isExtended: false, isRemote: false, ...t.build(nodeId) });
  };

  const groups = [...new Set(CANOPEN_TEMPLATES.map((t) => t.group))];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2 }}>
      <button className="btn btn-ghost btn-sm" onClick={save} title="Save this list to a JSON file">Save list</button>
      <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}
        title="Replace this list with a saved JSON file">Load list</button>
      <input ref={fileRef} type="file" accept=".json,application/json" style={{ display: 'none' }}
        onChange={(e) => { void load(e.target.files?.[0]); e.target.value = ''; }} />
      <span style={{ width: 1, height: 16, background: 'var(--border-default)', margin: '0 4px' }} />
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>CANopen template</span>
      <select
        className="field-select"
        style={{ width: 'auto', fontSize: 11, padding: '2px 6px' }}
        value=""
        onChange={(e) => addTemplate(parseInt(e.target.value))}
      >
        <option value="">+ add...</option>
        {groups.map((g) => (
          <optgroup key={g} label={g}>
            {CANOPEN_TEMPLATES.map((t, i) => t.group === g && <option key={i} value={i}>{t.label}</option>)}
          </optgroup>
        ))}
      </select>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>node</span>
      <input
        className="field-input"
        style={{ width: 44, fontSize: 11, padding: '2px 6px' }}
        value={node}
        placeholder={String(firstNode ?? 1)}
        onChange={(e) => setNode(e.target.value)}
        title="Node ID (1-127) for templates; empty = first node seen on the bus"
      />
      {message && (
        <span style={{ fontSize: 11, color: message.startsWith('Loaded') ? 'var(--accent-green)' : 'var(--accent-red)' }}>
          {message}
        </span>
      )}
    </div>
  );
}

export function SendFramePanel() {
  const status      = useConnectionStore((s) => s.status);
  const isConnected = status === 'connected';

  const { frames, addFrame, removeFrame, updateFrame, sendOnce, toggleTimer, stopAll } =
    useSendFrameStore();

  // Stop all timers when disconnected
  useEffect(() => {
    if (!isConnected) stopAll();
  }, [isConnected, stopAll]);

  const inp: React.CSSProperties = {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    padding: '2px 5px',
    outline: 'none',
    width: '100%',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>

      <ListToolbar />

      {/* Column headers */}
      <div style={{ display: 'grid', ...gridStyle, color: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', padding: '0 2px' }}>
        <span>CAN ID</span>
        <span>DLC</span>
        <span>Data (hex)</span>
        <span />
        <span />
        <span>Interval</span>
        <span />
      </div>

      {/* Frame rows */}
      {frames.map((f) => (
        <div key={f.id} style={{ display: 'flex', flexDirection: 'column', gap: 3,
          background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)',
          border: `1px solid ${f.isRunning ? 'var(--accent-green)' : 'var(--border-subtle)'}`,
          padding: '5px 7px', transition: 'border-color 0.2s' }}>

          {/* Optional name */}
          <input
            style={{ ...inp, border: 'none', background: 'transparent', padding: '0 2px', fontSize: 10,
              fontFamily: 'var(--font-ui)', color: f.name ? 'var(--text-secondary)' : 'var(--text-muted)' }}
            value={f.name}
            placeholder="name (optional)"
            onChange={(e) => updateFrame(f.id, { name: e.target.value })}
          />

          {/* Input row */}
          <div style={{ display: 'grid', ...gridStyle, alignItems: 'center', gap: 5 }}>

            {/* CAN ID */}
            <input
              style={inp}
              value={f.canId}
              placeholder="0x123"
              onChange={(e) => updateFrame(f.id, { canId: e.target.value })}
            />

            {/* DLC */}
            <select
              style={{ ...inp, cursor: 'pointer' }}
              value={f.dlc}
              onChange={(e) => {
                const dlc = parseInt(e.target.value);
                const bytes = f.data.trim().split(/\s+/).map((h) => parseInt(h, 16) || 0);
                const padded = Array.from({ length: dlc }, (_, i) => bytes[i] ?? 0);
                updateFrame(f.id, {
                  dlc,
                  data: padded.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' '),
                });
              }}
            >
              {DLC_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>

            {/* Data -- unused for remote frames */}
            <input
              style={{ ...inp, letterSpacing: '0.04em', opacity: f.isRemote ? 0.4 : 1 }}
              value={f.isRemote ? '' : f.data}
              placeholder={f.isRemote ? 'remote request: no data' : 'FF 00 3C ...'}
              disabled={f.isRemote}
              onChange={(e) => updateFrame(f.id, { data: e.target.value })}
            />

            {/* Extended ID toggle- label sits under checkbox so it fits the narrow column */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <input
                type="checkbox"
                checked={f.isExtended}
                onChange={(e) => updateFrame(f.id, { isExtended: e.target.checked })}
                title="29-bit extended ID- required for J1939 and some proprietary protocols. Standard CAN uses 11-bit."
                style={{ cursor: 'pointer', accentColor: 'var(--accent-green)', margin: 0 }}
              />
              <span style={{
                fontSize: 'var(--fs-xs)',
                fontFamily: 'var(--font-mono)',
                color: f.isExtended ? 'var(--accent-green)' : 'var(--text-muted)',
                letterSpacing: '0.02em',
                lineHeight: 1,
                userSelect: 'none',
              }}>
                29-bit
              </span>
            </div>

            {/* Remote frame (RTR) toggle */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <input
                type="checkbox"
                checked={f.isRemote}
                onChange={(e) => updateFrame(f.id, { isRemote: e.target.checked })}
                title="Remote transmission request (RTR) - no data; DLC is the length requested from the other node."
                style={{ cursor: 'pointer', accentColor: 'var(--accent-amber)', margin: 0 }}
              />
              <span style={{
                fontSize: 'var(--fs-xs)',
                fontFamily: 'var(--font-mono)',
                color: f.isRemote ? 'var(--accent-amber)' : 'var(--text-muted)',
                letterSpacing: '0.02em',
                lineHeight: 1,
                userSelect: 'none',
              }}>
                RTR
              </span>
            </div>

            {/* Interval + rate label */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <input
                style={{ ...inp, width: 52 }}
                type="number"
                min={0}
                max={60000}
                value={f.intervalMs}
                onChange={(e) => updateFrame(f.id, { intervalMs: Math.max(0, parseInt(e.target.value) || 0) })}
                title="Interval in milliseconds (0 = send by hand only)"
              />
              <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                ms{f.intervalMs > 0 ? ` · ${rateLabel(f.intervalMs)}` : ''}
              </span>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 3, justifyContent: 'flex-end' }}>
              {/* Start / Stop timer */}
              <button
                title={f.isRunning ? 'Stop timer' : 'Start timer'}
                disabled={!isConnected || f.intervalMs <= 0}
                onClick={() => toggleTimer(f.id)}
                style={{
                  ...btnStyle,
                  background: f.isRunning ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.12)',
                  border: `1px solid ${f.isRunning ? '#ef444440' : '#22c55e40'}`,
                  color: f.isRunning ? '#ef4444' : '#22c55e',
                  opacity: (!isConnected || f.intervalMs <= 0) ? 0.4 : 1,
                }}
              >
                {f.isRunning ? '■' : '▶'}
              </button>

              {/* Send once */}
              <button
                title="Send once"
                disabled={!isConnected}
                onClick={() => sendOnce(f.id)}
                style={{ ...btnStyle, opacity: !isConnected ? 0.4 : 1 }}
              >
                ↑
              </button>

              {/* Remove */}
              <button
                title="Remove frame"
                onClick={() => removeFrame(f.id)}
                style={{ ...btnStyle, color: 'var(--text-muted)' }}
              >
                ×
              </button>
            </div>
          </div>

          {/* Feedback row */}
          {(f.lastSent || f.error) && (
            <div style={{
              fontSize: 10, fontFamily: 'var(--font-mono)',
              color: f.error ? '#ef4444' : 'var(--accent-green)',
              paddingTop: 2, borderTop: '1px solid var(--border-subtle)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {f.error ? `⚠ ${f.error}` : `↑ ${f.lastSent}`}
            </div>
          )}
        </div>
      ))}

      {/* Add frame button */}
      <button
        onClick={() => addFrame()}
        style={{
          background: 'none',
          border: '1px dashed var(--border-default)',
          borderRadius: 'var(--radius-sm)',
          color: 'var(--text-muted)',
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
          padding: '5px',
          cursor: 'pointer',
          width: '100%',
        }}
      >
        + Add Frame
      </button>
    </div>
  );
}

const gridStyle = {
  gridTemplateColumns: '72px 44px 1fr 28px 28px 110px auto',
  gap: 5,
};

const btnStyle: React.CSSProperties = {
  background: 'var(--bg-panel)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-secondary)',
  fontSize: 12,
  padding: '2px 6px',
  cursor: 'pointer',
  fontFamily: 'var(--font-mono)',
  lineHeight: 1.4,
};