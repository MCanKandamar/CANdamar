/**
 * sdo.ts
 * ------
 * CANopen SDO display helpers: abort codes (CiA 301, section 7.2.4.3.17)
 * and response classification for the SDO log and the message table.
 *
 * An SDO abort frame carries a 32-bit abort code in bytes 4-7
 * (little-endian). The backend reports it as `value_int` of the
 * SDO transaction, e.g. bytes "13 00 07 06" -> 0x06070013.
 */

export const SDO_ABORT_CODES: Record<number, string> = {
  0x05030000: 'Toggle bit not alternated',
  0x05040000: 'SDO protocol timed out',
  0x05040001: 'Command specifier not valid or unknown',
  0x05040002: 'Invalid block size (block mode)',
  0x05040003: 'Invalid sequence number (block mode)',
  0x05040004: 'CRC error (block mode)',
  0x05040005: 'Out of memory',
  0x06010000: 'Unsupported access to an object',
  0x06010001: 'Attempt to read a write-only object',
  0x06010002: 'Attempt to write a read-only object',
  0x06020000: 'Object does not exist in the object dictionary',
  0x06040041: 'Object cannot be mapped to the PDO',
  0x06040042: 'Mapped objects would exceed the PDO length',
  0x06040043: 'General parameter incompatibility',
  0x06040047: 'General internal incompatibility in the device',
  0x06060000: 'Access failed due to a hardware error',
  0x06070010: 'Data type does not match, length does not match',
  0x06070012: 'Data type does not match, length too high',
  0x06070013: 'Data type does not match, length too low',
  0x06090011: 'Sub-index does not exist',
  0x06090030: 'Invalid value for parameter',
  0x06090031: 'Value of parameter written too high',
  0x06090032: 'Value of parameter written too low',
  0x06090036: 'Maximum value is less than minimum value',
  0x060A0023: 'Resource not available: SDO connection',
  0x08000000: 'General error',
  0x08000020: 'Data cannot be transferred or stored to the application',
  0x08000021: 'Data cannot be transferred or stored (local control)',
  0x08000022: 'Data cannot be transferred or stored (present device state)',
  0x08000023: 'Object dictionary not present or dynamic generation failed',
  0x08000024: 'No data available',
};

/** Format an abort code the way it appears in CiA 301, e.g. 0x06070013. */
export function formatAbortCode(code: number): string {
  return '0x' + (code >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

/** Human-readable description; unknown codes fall back to their class (byte 3). */
export function sdoAbortText(code: number): string {
  const known = SDO_ABORT_CODES[code >>> 0];
  if (known) return known;
  const cls = (code >>> 24) & 0xFF;
  if (cls === 0x05) return 'SDO protocol error';
  if (cls === 0x06) return 'Object access error';
  if (cls === 0x08) return 'Application error';
  return 'Unknown abort code';
}

/** Fields of an SDO transaction the helpers below need. */
interface SdoResult {
  response_cmd: string;
  data_hex: string;
  value_int?: number | null;
}

/**
 * A download (write) response carries no value -- bytes 4-7 are reserved
 * and always zero, so "00 00 00 00 (0)" would read like a value of 0.
 */
export function isSdoWriteResponse(r: SdoResult): boolean {
  return r.response_cmd.startsWith('Download');
}

/** Abort code of an abort transaction, from value_int or the raw bytes. */
export function sdoAbortCodeOf(r: SdoResult): number | null {
  if (r.value_int !== null && r.value_int !== undefined) return r.value_int >>> 0;
  const bytes = r.data_hex.trim().split(/\s+/).filter(Boolean).map((b) => parseInt(b, 16));
  if (bytes.length !== 4 || bytes.some(isNaN)) return null;
  return (bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24)) >>> 0;
}

// ── Typed values for expedited SDO download ────────────────────────────────

export type SdoValueType = 'u8' | 'i8' | 'u16' | 'i16' | 'u32' | 'i32' | 'f32' | 'raw';

export const SDO_VALUE_TYPES: { id: SdoValueType; label: string; size: number }[] = [
  { id: 'u8',  label: 'UNSIGNED8',  size: 1 },
  { id: 'i8',  label: 'INTEGER8',   size: 1 },
  { id: 'u16', label: 'UNSIGNED16', size: 2 },
  { id: 'i16', label: 'INTEGER16',  size: 2 },
  { id: 'u32', label: 'UNSIGNED32', size: 4 },
  { id: 'i32', label: 'INTEGER32',  size: 4 },
  { id: 'f32', label: 'REAL32',     size: 4 },
  { id: 'raw', label: 'Raw bytes',  size: 0 },
];

export type SdoEncodeResult = { bytes: number[] } | { error: string };

/** Parse "DE AD 01" / "0xDE,0xAD" into 1-4 bytes (the original raw input). */
function parseRawBytes(text: string): SdoEncodeResult {
  const parts = text.trim().split(/\s+|,/).filter(Boolean);
  const out: number[] = [];
  for (const p of parts) {
    const b = parseInt(p.replace(/^0x/i, ''), 16);
    if (!/^(0x)?[0-9a-f]{1,2}$/i.test(p) || isNaN(b)) return { error: `"${p}" is not a hex byte` };
    out.push(b);
  }
  if (out.length < 1 || out.length > 4) return { error: 'Enter 1-4 bytes' };
  return { bytes: out };
}

/**
 * Encode a user-entered value as little-endian bytes for an SDO write.
 * Integers accept decimal ("-1500") or hex ("0x5DC"); hex is taken as the
 * raw bit pattern, so "0xFFFF" is valid for INTEGER16 (= -1).
 */
export function encodeSdoValue(type: SdoValueType, text: string): SdoEncodeResult {
  const t = text.trim();
  if (!t) return { error: 'Enter a value' };
  if (type === 'raw') return parseRawBytes(t);

  const size = SDO_VALUE_TYPES.find((x) => x.id === type)!.size;
  const view = new DataView(new ArrayBuffer(size));

  if (type === 'f32') {
    const v = Number(t);
    if (!Number.isFinite(v)) return { error: 'Not a number' };
    view.setFloat32(0, v, true);
  } else {
    const bits   = size * 8;
    const signed = type.startsWith('i');
    let pattern: number;   // unsigned bit pattern that goes on the wire
    if (/^0x[0-9a-f]+$/i.test(t)) {
      pattern = parseInt(t.slice(2), 16);
      if (pattern > 2 ** bits - 1) return { error: `Out of range for ${bits}-bit` };
    } else if (/^[+-]?\d+$/.test(t)) {
      const v   = parseInt(t, 10);
      const min = signed ? -(2 ** (bits - 1)) : 0;
      const max = signed ? 2 ** (bits - 1) - 1 : 2 ** bits - 1;
      if (v < min || v > max) return { error: `Range ${min} .. ${max}` };
      pattern = v < 0 ? v + 2 ** bits : v;   // two's complement
    } else {
      return { error: 'Integer expected (decimal or 0x hex)' };
    }
    if (size === 1)      view.setUint8(0, pattern);
    else if (size === 2) view.setUint16(0, pattern, true);
    else                 view.setUint32(0, pattern, true);
  }
  return { bytes: Array.from(new Uint8Array(view.buffer)) };
}

/** "DC 05 00 00" */
export function bytesToHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}
