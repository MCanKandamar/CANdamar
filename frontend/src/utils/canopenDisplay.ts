/**
 * canopenDisplay.ts
 * -----------------
 * How CANopen frames are labelled in the Frames table (Monitor and Trace):
 * a colour per frame type and a one-line detail (object name and value,
 * NMT state, EMCY error, PDO signals).
 */

import type { CANopenInfo } from '../types/can';
import { formatAbortCode, isSdoWriteResponse, sdoAbortCodeOf, sdoAbortText } from './sdo';

const CANOPEN_TYPE_COLORS: Record<string, string> = {
  NMT:        'var(--accent-amber)',
  SYNC:       'var(--text-muted)',
  TIME:       'var(--text-muted)',
  EMCY:       'var(--accent-red)',
  Heartbeat:  'var(--accent-green)',
  TPDO1:      '#61afef',
  TPDO2:      '#61afef',
  TPDO3:      '#61afef',
  TPDO4:      '#61afef',
  RPDO1:      '#c678dd',
  RPDO2:      '#c678dd',
  RPDO3:      '#c678dd',
  RPDO4:      '#c678dd',
  'SDO-req':  'var(--text-muted)',
  'SDO-resp': 'var(--accent-green)',
};

export function canopenTypeColor(frameType: string): string {
  return CANOPEN_TYPE_COLORS[frameType] ?? 'var(--text-secondary)';
}

export function canopenDetail(co: CANopenInfo): string {
  // SDO response with paired transaction -- show object name + value
  if (co.sdo_transaction && co.sdo_transaction.object_name) {
    const t = co.sdo_transaction;
    if (t.is_abort) {
      const code = sdoAbortCodeOf(t);
      return `${t.object_name}: ABORT${code !== null ? ` ${formatAbortCode(code)} ${sdoAbortText(code)}` : ''}`;
    }
    if (isSdoWriteResponse(t)) return `${t.object_name}: WRITE OK`;
    if (t.value_text) return `${t.object_name} = "${t.value_text}"`;
    const val = t.data_hex ?? '';
    return `${t.object_name}${val ? ' = ' + val : ''}`;
  }
  // Heartbeat -- just the NMT state
  if (co.frame_type === 'Heartbeat' && co.nmt_state) {
    return co.nmt_state;
  }
  // EMCY -- error name
  if (co.frame_type === 'EMCY' && co.emcy) {
    return co.emcy.error_name;
  }
  // NMT command
  if (co.frame_type === 'NMT' && co.nmt) {
    return co.nmt.description;
  }
  // PDO with signals (EDS decoded)
  if (co.pdo_signals?.length) {
    return co.pdo_signals.map((s) => `${s.name}=${s.value}`).join('  ');
  }
  // Generic detail string
  return co.detail ?? '';
}
