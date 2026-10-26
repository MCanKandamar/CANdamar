import { useCallback, useEffect, useState } from 'react';
import { useConnectionStore } from '../../store/connectionStore';
import { useFrameStore } from '../../store/frameStore';
import { apiListPorts } from '../../api/client';
import type { SerialPortInfo } from '../../api/client';
import type { InterfaceType } from '../../types/can';

const BITRATES = [
  { label: '125 kbps', value: 125000 },
  { label: '250 kbps', value: 250000 },
  { label: '500 kbps', value: 500000 },
  { label: '1 Mbps',   value: 1000000 },
];

// slcan S0-S8 bitrates as mapped by python-can (S7 is left out: firmwares
// disagree on whether it means 750 or 800 kbit/s)
const SLCAN_BITRATES = [
  { label: '10 kbps (S0)',  value: 10000 },
  { label: '20 kbps (S1)',  value: 20000 },
  { label: '50 kbps (S2)',  value: 50000 },
  { label: '100 kbps (S3)', value: 100000 },
  { label: '125 kbps (S4)', value: 125000 },
  { label: '250 kbps (S5)', value: 250000 },
  { label: '500 kbps (S6)', value: 500000 },
  { label: '1 Mbps (S8)',   value: 1000000 },
];

// Serial baud rates, shown as plain numbers (115200) like terminal programs do
const BAUDRATES = [
  9600, 19200, 38400, 57600, 115200, 230400, 460800, 500000, 921600, 1000000, 2000000,
];

const INTERFACES: { label: string; value: InterfaceType; hint: string }[] = [
  { value: 'gs_usb',      label: 'gs_usb (Candlelight)',        hint: 'FYSETC UCAN, CANable 2.0 Pro - no COM port' },
  { value: 'slcan',       label: 'slcan (COM port)',             hint: 'CANable slcan firmware - appears as COM3 etc.' },
  { value: 'seeedstudio', label: 'USB-CAN Analyzer (GY/Seeed)', hint: 'Cheap USB CAN analyzers with 0xAA/0x55 binary protocol - appears as COM port. No baud rate config needed.' },
  { value: 'socketcan',   label: 'SocketCAN (Linux)',            hint: 'Linux SocketCAN - Raspberry Pi, WSL2. Run: sudo ip link set can0 up type can bitrate 500000' },
  { value: 'virtual',     label: 'virtual (testing)',            hint: 'Software bus - no hardware required' },
  { value: 'pcan',        label: 'PCAN (PEAK)',                  hint: 'PEAK PCAN-USB - requires PEAK driver installed. Shows as CAN-Hardware in Device Manager.' },
  { value: 'kvaser',      label: 'Kvaser',                       hint: 'Kvaser hardware - requires Kvaser CANlib installed. Shows as CAN-Hardware (Kvaser) in Device Manager.' },
];

// ── COM port picker (slcan, seeedstudio) ─────────────────────────────────────
// Lists the serial ports the backend can see. Known slcan adapters are
// labelled and picked automatically; "Other" allows typing any port name.

const MANUAL = '__manual__';

function portLabel(p: SerialPortInfo): string {
  return `${p.device} - ${p.adapter ?? p.description}`;
}

function ComPortField({ placeholder, disabled }: { placeholder: string; disabled: boolean }) {
  const channel   = useConnectionStore((s) => s.config.channel ?? '');
  const setConfig = useConnectionStore((s) => s.setConfig);

  const [ports,   setPorts]   = useState<SerialPortInfo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [manual,  setManual]  = useState(false);

  const refresh = useCallback(async (initial: boolean) => {
    setLoading(true);
    try {
      const res = await apiListPorts();
      setPorts(res.ports);
      // Auto-pick only a known adapter or a USB port -- never a Bluetooth/legacy
      // COM port. On first load a known adapter wins over the default "COM3";
      // later refreshes only replace a port that has disappeared.
      const current = useConnectionStore.getState().config.channel ?? '';
      const known   = res.ports.find((p) => p.adapter);
      const currentPort = res.ports.find((p) => p.device === current);
      if (initial && known && !currentPort?.adapter) {
        setConfig({ channel: known.device });
      } else if (!currentPort) {
        const pick = known ?? res.ports.find((p) => p.usb);
        if (pick) setConfig({ channel: pick.device });
      }
    } catch {
      setPorts([]);
    } finally {
      setLoading(false);
    }
  }, [setConfig]);

  useEffect(() => { if (!disabled) refresh(true); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const listed     = ports?.some((p) => p.device === channel) ?? false;
  const showManual = manual || (ports !== null && ports.length === 0);

  return (
    <>
      <div style={{ display: 'flex', gap: 6 }}>
        {showManual ? (
          <input
            className="field-input"
            type="text"
            placeholder={placeholder}
            value={channel}
            disabled={disabled}
            onChange={(e) => setConfig({ channel: e.target.value })}
          />
        ) : (
          <select
            className="field-select"
            value={channel}
            disabled={disabled || ports === null}
            onChange={(e) => {
              if (e.target.value === MANUAL) setManual(true);
              else setConfig({ channel: e.target.value });
            }}
          >
            {/* Keep a typed or saved value visible even if it is not plugged in */}
            {!listed && <option value={channel}>{channel ? `${channel} - not found` : '- select port -'}</option>}
            {(ports ?? []).map((p) => (
              <option key={p.device} value={p.device}>{portLabel(p)}</option>
            ))}
            <option value={MANUAL}>Other (type a port name)...</option>
          </select>
        )}
        <button
          className="btn btn-ghost"
          style={{ padding: '0 8px', flexShrink: 0 }}
          onClick={() => { setManual(false); refresh(false); }}
          disabled={disabled || loading}
          title="Refresh the port list"
        >
          {loading ? '...' : '↻'}
        </button>
      </div>
      {ports !== null && ports.length === 0 && (
        <span style={styles.hint}>No serial ports found - type the port name.</span>
      )}
    </>
  );
}

export function ConnectionPanel() {
  const status       = useConnectionStore((s) => s.status);
  const config       = useConnectionStore((s) => s.config);
  const error        = useConnectionStore((s) => s.error);
  const setInterface = useConnectionStore((s) => s.setInterface);
  const setConfig    = useConnectionStore((s) => s.setConfig);
  const connect      = useConnectionStore((s) => s.connect);
  const disconnect   = useConnectionStore((s) => s.disconnect);

  const totalFrames  = useFrameStore((s) => s.totalFramesReceived);
  const clearFrames  = useFrameStore((s) => s.clearFrames);

  const isConnected   = status === 'connected';
  const isBusy        = status === 'connecting' || status === 'disconnecting';
  const canConnect    = !isConnected && !isBusy;
  const canDisconnect = isConnected && !isBusy;

  const selectedIface = INTERFACES.find((i) => i.value === config.interface);

  return (
    <div>
      {/* Interface */}
      <div className="field-group">
        <label className="field-label">Interface</label>
        <select
          className="field-select"
          value={config.interface}
          disabled={isConnected || isBusy}
          onChange={(e) => setInterface(e.target.value as InterfaceType)}
        >
          {INTERFACES.map((i) => (
            <option key={i.value} value={i.value}>{i.label}</option>
          ))}
        </select>
        {selectedIface && (
          <span style={styles.hint}>{selectedIface.hint}</span>
        )}
      </div>

      {/* gs_usb: device index */}
      {config.interface === 'gs_usb' && (
        <div className="field-group">
          <label className="field-label">Device Index</label>
          <input
            className="field-input"
            type="number"
            min={0}
            max={9}
            value={config.index ?? 0}
            disabled={isConnected || isBusy}
            onChange={(e) => setConfig({ index: parseInt(e.target.value) || 0 })}
          />
        </div>
      )}

      {/* slcan: COM port + serial baud rate */}
      {config.interface === 'slcan' && (
        <>
          <div className="field-group">
            <label className="field-label">COM Port</label>
            <ComPortField placeholder="COM3" disabled={isConnected || isBusy} />
            <label className="field-label">Baudrate</label>
            <select
              className="field-select"
              value={config.baudrate}
              disabled={isConnected || isBusy}
              onChange={(e) => setConfig({ baudrate: parseInt(e.target.value) })}
            >
              {BAUDRATES.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>

          </div>
          <div className="field-group">
            <label className="field-label">CAN Mode</label>
            <select
              className="field-select"
              value={config.listenOnly ? 'listen' : 'normal'}
              disabled={isConnected || isBusy}
              onChange={(e) => setConfig({ listenOnly: e.target.value === 'listen' })}
            >
              <option value="normal">Normal (O)</option>
              <option value="listen">Listen-only (L)</option>
            </select>
            <span style={styles.hint}>
              {config.listenOnly
                ? 'Silent: the adapter never ACKs or transmits. Sending is disabled.'
                : 'The adapter ACKs frames and can transmit.'}
            </span>
          </div>
        </>
      )}

      {/* seeedstudio: COM port only — no serial baud rate, protocol handles init */}
      {config.interface === 'seeedstudio' && (
        <div className="field-group">
          <label className="field-label">COM Port</label>
          <ComPortField placeholder="COM8" disabled={isConnected || isBusy} />
        </div>
      )}

      {/* socketcan: channel */}
      {config.interface === 'socketcan' && (
        <div className="field-group">
          <label className="field-label">Channel</label>
          <input
            className="field-input"
            type="text"
            placeholder="can0"
            value={config.channel ?? ''}
            disabled={isConnected || isBusy}
            onChange={(e) => setConfig({ channel: e.target.value })}
          />
        </div>
      )}

      {/* pcan: USB channel selector */}
      {config.interface === 'pcan' && (
        <div className="field-group">
          <label className="field-label">USB Channel</label>
          <select
            className="field-select"
            value={config.channel ?? 'PCAN_USBBUS1'}
            disabled={isConnected || isBusy}
            onChange={(e) => setConfig({ channel: e.target.value })}
          >
            {[1,2,3,4,5,6,7,8].map((n) => (
              <option key={n} value={`PCAN_USBBUS${n}`}>PCAN_USBBUS{n}</option>
            ))}
          </select>
        </div>
      )}

      {/* kvaser: device index */}
      {config.interface === 'kvaser' && (
        <div className="field-group">
          <label className="field-label">Device Index</label>
          <input
            className="field-input"
            type="number"
            min={0}
            max={9}
            value={config.index ?? 0}
            disabled={isConnected || isBusy}
            onChange={(e) => setConfig({ index: parseInt(e.target.value) || 0 })}
          />
        </div>
      )}

      {/* Bitrate - not shown for virtual */}
      {config.interface !== 'virtual' && (
        <div className="field-group">
          <label className="field-label">Bitrate</label>
          <select
            className="field-select"
            value={config.bitrate}
            disabled={isConnected || isBusy}
            onChange={(e) => setConfig({ bitrate: parseInt(e.target.value) })}
          >
            {(config.interface === 'slcan' ? SLCAN_BITRATES : BITRATES).map((b) => (
              <option key={b.value} value={b.value}>{b.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Error */}
      {error && <div className="error-banner">{error}</div>}

      {/* Connect / Disconnect */}
      <div className="btn-row" style={{ marginTop: 10 }}>
        <button
          className="btn btn-primary flex-1"
          disabled={!canConnect}
          onClick={connect}
        >
          {status === 'connecting' ? 'Connecting…' : 'Connect'}
        </button>
        <button
          className="btn btn-danger"
          disabled={!canDisconnect}
          onClick={disconnect}
        >
          {status === 'disconnecting' ? '…' : 'Disconnect'}
        </button>
      </div>

      {/* Clear buffer - only useful when connected or after a session */}
      {totalFrames > 0 && (
        <>
          <div className="divider" style={{ marginTop: 10 }} />
          <div style={styles.clearRow}>
            <span className="text-xs text-muted mono">
              {totalFrames.toLocaleString()} frames in buffer
            </span>
            <button
              className="btn btn-ghost btn-sm"
              onClick={clearFrames}
            >
              Clear
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  hint: {
    fontSize: 10,
    color: 'var(--text-muted)',
    lineHeight: 1.4,
    marginTop: 2,
  },
  clearRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 4,
  },
};
