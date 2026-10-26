/**
 * cia402.ts
 * ---------
 * CiA 402 (drives and motion control) helpers for the Drive Control panel:
 * statusword bits (0x6041), the drive state they encode, and modes of
 * operation (0x6060 / 0x6061).
 *
 * Example: statusword 0x0237 = 0000 0010 0011 0111 -> bits 0,1,2,4,5,9 set
 * -> (sw & 0x6F) == 0x27 -> "Operation enabled", voltage on, remote.
 */

export const STATUSWORD_BITS: { bit: number; name: string; help: string }[] = [
  { bit: 0,  name: 'Ready to switch on', help: 'Bit 0' },
  { bit: 1,  name: 'Switched on',        help: 'Bit 1' },
  { bit: 2,  name: 'Operation enabled',  help: 'Bit 2: the drive is powering the motor' },
  { bit: 3,  name: 'Fault',              help: 'Bit 3: see 0x603F error code and EMCY' },
  { bit: 4,  name: 'Voltage enabled',    help: 'Bit 4: high voltage applied' },
  { bit: 5,  name: 'Quick stop',         help: 'Bit 5 is active low: 0 = quick stop in progress' },
  { bit: 6,  name: 'Switch on disabled', help: 'Bit 6' },
  { bit: 7,  name: 'Warning',            help: 'Bit 7' },
  { bit: 8,  name: 'Manufacturer 8',     help: 'Bit 8: manufacturer specific' },
  { bit: 9,  name: 'Remote',             help: 'Bit 9: the controlword (CAN) is in control' },
  { bit: 10, name: 'Target reached',     help: 'Bit 10' },
  { bit: 11, name: 'Internal limit',     help: 'Bit 11: an internal limit is active' },
  { bit: 12, name: 'Mode specific 12',   help: 'Bit 12: profile velocity = speed is zero' },
  { bit: 13, name: 'Mode specific 13',   help: 'Bit 13: profile velocity = max slippage error' },
  { bit: 14, name: 'Manufacturer 14',    help: 'Bit 14: manufacturer specific' },
  { bit: 15, name: 'Manufacturer 15',    help: 'Bit 15: manufacturer specific' },
];

/** Drive state from a statusword (CiA 402 state machine, mask table). */
export function cia402StateOf(sw: number): string {
  if ((sw & 0x4F) === 0x00) return 'Not ready to switch on';
  if ((sw & 0x4F) === 0x40) return 'Switch on disabled';
  if ((sw & 0x6F) === 0x21) return 'Ready to switch on';
  if ((sw & 0x6F) === 0x23) return 'Switched on';
  if ((sw & 0x6F) === 0x27) return 'Operation enabled';
  if ((sw & 0x6F) === 0x07) return 'Quick stop active';
  if ((sw & 0x4F) === 0x0F) return 'Fault reaction active';
  if ((sw & 0x4F) === 0x08) return 'Fault';
  return 'Unknown';
}

/** Modes of operation (0x6060, INTEGER8); negative values are manufacturer specific. */
export const CIA402_MODES: { value: number; label: string }[] = [
  { value: 1,  label: '1 Profile position' },
  { value: 3,  label: '3 Profile velocity' },
  { value: 4,  label: '4 Profile torque' },
  { value: 6,  label: '6 Homing' },
  { value: 7,  label: '7 Interpolated position' },
  { value: 8,  label: '8 Cyclic sync position' },
  { value: 9,  label: '9 Cyclic sync velocity' },
  { value: 10, label: '10 Cyclic sync torque' },
];

export function modeLabel(value: number): string {
  return CIA402_MODES.find((m) => m.value === value)?.label
    ?? (value < 0 ? `${value} Manufacturer specific` : `${value}`);
}

/** Little-endian bytes of a signed value: int8 -> 1 byte, int32 -> 4 bytes. */
export function signedBytes(value: number, size: 1 | 2 | 4): number[] {
  const out: number[] = [];
  for (let i = 0; i < size; i++) out.push((value >> (8 * i)) & 0xFF);
  return out;
}

/** Signed value of an unsigned reading (value_int) of `size` bytes. */
export function toSigned(value: number, size: 1 | 2 | 4): number {
  const bits = 8 * size;
  return value >= 2 ** (bits - 1) ? value - 2 ** bits : value;
}
