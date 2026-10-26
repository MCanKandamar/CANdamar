/**
 * DriveStatus.tsx
 * ---------------
 * Parts of the CiA 402 Drive Control panel:
 * - DriveSetpoints: write the mode of operation (0x6060) and the target
 *   velocity (0x60FF) by SDO; the answer (WRITE OK or abort) shows in the
 *   SDO log.
 * - StatuswordView: read the statusword (0x6041) and the mode display
 *   (0x6061) by SDO, once or every 500 ms, and show every statusword bit
 *   and the drive state it encodes. These reads stay out of the SDO log.
 */

import { useCallback, useEffect, useState } from 'react';
import { BASE } from '../../api/client';
import {
  STATUSWORD_BITS, CIA402_MODES, cia402StateOf, modeLabel, signedBytes, toSigned,
} from '../../utils/cia402';

const AUTO_READ_MS = 500;

async function sdoWrite(nodeId: number, index: number, data: number[]): Promise<string> {
  const res = await fetch(`${BASE}/canopen/sdo/write`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ node_id: nodeId, index, subindex: 0, data, confirmed: true }),
  });
  const body = await res.json();
  if (!res.ok || !body.ok) throw new Error(body.detail ?? res.statusText);
  return `Sent to 0x${index.toString(16).toUpperCase()} -- the answer appears in the SDO log`;
}

/** Quiet SDO read; returns the unsigned value or throws with the reason. */
async function sdoReadQuiet(nodeId: number, index: number): Promise<number> {
  const res = await fetch(`${BASE}/canopen/sdo/read`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ node_id: nodeId, index, subindex: 0, quiet: true }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.detail ?? res.statusText);
  if (!body.ok) throw new Error(body.abort_code ? `abort ${body.abort_code}` : body.detail);
  if (body.value_int == null) throw new Error('no value');
  return body.value_int;
}

// ── Mode of operation + target velocity ───────────────────────────────────────

export function DriveSetpoints({ nodeId }: { nodeId: number }) {
  const [mode, setMode]         = useState(3);
  const [velocity, setVelocity] = useState('0');
  const [result, setResult]     = useState<string | null>(null);

  const run = async (what: () => Promise<string>) => {
    setResult(null);
    try { setResult(await what()); } catch (e) { setResult(`Error: ${(e as Error).message}`); }
  };

  const v = parseInt(velocity);
  const velocityValid = Number.isInteger(v) && v >= -(2 ** 31) && v < 2 ** 31;

  return (
    <div style={st.block}>
      <div style={st.row}>
        <div style={st.group}>
          <span style={st.label}>Mode of operation (0x6060)</span>
          <select style={st.input} value={mode} onChange={(e) => setMode(parseInt(e.target.value))}>
            {CIA402_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <button className="btn btn-ghost btn-sm" style={st.btn}
          onClick={() => run(() => sdoWrite(nodeId, 0x6060, signedBytes(mode, 1)))}
          title="Write the mode (INTEGER8) to 0x6060:0">
          Set mode
        </button>

        <div style={st.group}>
          <span style={st.label}>Target velocity (0x60FF)</span>
          <input style={{ ...st.input, width: 90 }} value={velocity}
            onChange={(e) => setVelocity(e.target.value)} placeholder="0"
            title="INTEGER32 in the drive's velocity unit (often rpm)" />
        </div>
        <button className="btn btn-ghost btn-sm" style={st.btn} disabled={!velocityValid}
          onClick={() => run(() => sdoWrite(nodeId, 0x60FF, signedBytes(v, 4)))}
          title="Write the target velocity (INTEGER32, little-endian) to 0x60FF:0">
          Set velocity
        </button>
        <button className="btn btn-ghost btn-sm" style={st.btn}
          onClick={() => { setVelocity('0'); void run(() => sdoWrite(nodeId, 0x60FF, signedBytes(0, 4))); }}
          title="Write 0 to 0x60FF">
          Zero
        </button>
      </div>
      {result && <div style={result.startsWith('Error') ? st.err : st.ok}>{result}</div>}
    </div>
  );
}

// ── Statusword bits ───────────────────────────────────────────────────────────

export function StatuswordView({ nodeId }: { nodeId: number }) {
  const [sw, setSw]         = useState<number | null>(null);
  const [mode, setMode]     = useState<number | null>(null);
  const [error, setError]   = useState<string | null>(null);
  const [auto, setAuto]     = useState(false);
  const [readAt, setReadAt] = useState<number | null>(null);

  const read = useCallback(async () => {
    try {
      setSw(await sdoReadQuiet(nodeId, 0x6041));
      setReadAt(Date.now());
      setError(null);
    } catch (e) {
      setError(`0x6041: ${(e as Error).message}`);
      return;
    }
    try {
      setMode(toSigned(await sdoReadQuiet(nodeId, 0x6061), 1));
    } catch {
      setMode(null);   // optional object -- many drives without modes lack it
    }
  }, [nodeId]);

  // New node: forget the old reading
  useEffect(() => { setSw(null); setMode(null); setError(null); }, [nodeId]);

  useEffect(() => {
    if (!auto) return;
    let stopped = false;
    const loop = async () => {
      while (!stopped) {
        await read();
        await new Promise((r) => setTimeout(r, AUTO_READ_MS));
      }
    };
    void loop();
    return () => { stopped = true; };
  }, [auto, read]);

  return (
    <div style={st.block}>
      <div style={{ ...st.row, alignItems: 'center' }}>
        <button className="btn btn-ghost btn-sm" style={st.btn} onClick={() => void read()}
          title="Read 0x6041 statusword and 0x6061 mode display (not logged)">
          Read status
        </button>
        <label style={st.check} title={`Read every ${AUTO_READ_MS} ms (not logged)`}>
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> auto
        </label>
        {sw !== null && (
          <>
            <span className="mono" style={st.value}>0x{sw.toString(16).toUpperCase().padStart(4, '0')}</span>
            <span style={{ ...st.state, color: stateColor(cia402StateOf(sw)) }}>{cia402StateOf(sw)}</span>
            {mode !== null && <span style={st.muted}>mode {modeLabel(mode)}</span>}
            {readAt && <span style={st.muted}>{new Date(readAt).toTimeString().slice(0, 8)}</span>}
          </>
        )}
        {error && <span style={st.errInline}>{error}</span>}
      </div>

      {sw !== null && (
        <div style={st.bits}>
          {STATUSWORD_BITS.map(({ bit, name, help }) => {
            const on = (sw >> bit) & 1;
            // Quick stop (bit 5) is active low: highlight it when it is 0
            const alarm = (bit === 3 && on) || (bit === 5 && !on) || (bit === 7 && on);
            return (
              <span key={bit} title={help} style={{
                ...st.bit,
                color:       alarm ? 'var(--accent-red)' : on ? 'var(--accent-green)' : 'var(--text-muted)',
                borderColor: alarm ? 'var(--accent-red)' : on ? 'var(--accent-green)' : 'var(--border-default)',
                background:  on ? 'var(--accent-green-dim)' : 'transparent',
              }}>
                <span className="mono" style={{ opacity: 0.7 }}>{bit}</span> {name}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function stateColor(state: string): string {
  if (state === 'Operation enabled') return 'var(--accent-green)';
  if (state.startsWith('Fault'))     return 'var(--accent-red)';
  return 'var(--accent-amber)';
}

const st: Record<string, React.CSSProperties> = {
  block: { marginTop: 10 },
  row:   { display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap' },
  group: { display: 'flex', flexDirection: 'column', gap: 2 },
  label: { fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' },
  input: {
    background: 'var(--bg-input)', border: '1px solid var(--border-strong)',
    borderRadius: 4, padding: '3px 7px', color: 'var(--text-primary)', fontSize: 'var(--fs-md)',
  },
  btn:   { fontSize: 'var(--fs-sm)' },
  check: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' },
  value: { fontSize: 'var(--fs-md)', fontWeight: 600 },
  state: { fontSize: 'var(--fs-md)', fontWeight: 700 },
  muted: { fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' },
  ok:    { fontSize: 'var(--fs-sm)', marginTop: 5, color: 'var(--accent-green)' },
  err:   { fontSize: 'var(--fs-sm)', marginTop: 5, color: 'var(--accent-red)' },
  errInline: { fontSize: 'var(--fs-sm)', color: 'var(--accent-red)' },
  bits:  { display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  bit:   {
    fontSize: 'var(--fs-xs)', border: '1px solid', borderRadius: 3, padding: '1px 5px',
    whiteSpace: 'nowrap',
  },
};
