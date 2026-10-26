/**
 * canopenTemplates.ts
 * -------------------
 * Ready-made CANopen frames for the Send Frame list. Each template is built
 * for one node ID. SDO writes are expedited downloads with the size in the
 * command byte (0x2F = 1 byte, 0x2B = 2 bytes, 0x23 = 4 bytes); values are
 * little-endian, e.g. controlword 0x000F -> bytes "0F 00".
 */

export interface FrameTemplate {
  group: string;
  label: string;
  /** Frame fields for node `n` (1-127) */
  build: (n: number) => {
    canId:      string;
    dlc:        number;
    data:       string;
    isRemote?:  boolean;
    intervalMs: number;   // 0 = send by hand only
  };
}

const hex = (v: number, digits = 2) => v.toString(16).toUpperCase().padStart(digits, '0');
const cob = (base: number, n: number) => `0x${hex(base + n, 3)}`;

/** Expedited SDO download of a 16-bit value to `index`:`sub` */
const sdoWrite16 = (n: number, index: number, sub: number, value: number) => ({
  canId: cob(0x600, n),
  dlc:   8,
  data:  ['2B', hex(index & 0xFF), hex(index >> 8), hex(sub), hex(value & 0xFF), hex(value >> 8), '00', '00'].join(' '),
  intervalMs: 0,
});

/** SDO upload (read) request for `index`:`sub` */
const sdoRead = (n: number, index: number, sub: number) => ({
  canId: cob(0x600, n),
  dlc:   8,
  data:  ['40', hex(index & 0xFF), hex(index >> 8), hex(sub), '00', '00', '00', '00'].join(' '),
  intervalMs: 0,
});

const nmt = (cs: number, n: number) => ({ canId: '0x000', dlc: 2, data: `${hex(cs)} ${hex(n)}`, intervalMs: 0 });

export const CANOPEN_TEMPLATES: FrameTemplate[] = [
  { group: 'NMT', label: 'Start node (Operational)',   build: (n) => nmt(0x01, n) },
  { group: 'NMT', label: 'Enter Pre-operational',      build: (n) => nmt(0x80, n) },
  { group: 'NMT', label: 'Stop node',                  build: (n) => nmt(0x02, n) },
  { group: 'NMT', label: 'Reset node',                 build: (n) => nmt(0x81, n) },
  { group: 'NMT', label: 'Reset communication',        build: (n) => nmt(0x82, n) },
  { group: 'NMT', label: 'Node guarding request (RTR)',
    build: (n) => ({ canId: cob(0x700, n), dlc: 1, data: '', isRemote: true, intervalMs: 0 }) },
  { group: 'SYNC', label: 'SYNC every 100 ms',
    build: () => ({ canId: '0x080', dlc: 0, data: '', intervalMs: 100 }) },
  { group: 'SDO read', label: '0x6041 Statusword',         build: (n) => sdoRead(n, 0x6041, 0) },
  { group: 'SDO read', label: '0x6061 Mode of operation display', build: (n) => sdoRead(n, 0x6061, 0) },
  { group: 'SDO read', label: '0x1001 Error register',     build: (n) => sdoRead(n, 0x1001, 0) },
  { group: 'SDO read', label: '0x1008 Device name',        build: (n) => sdoRead(n, 0x1008, 0) },
  { group: 'SDO read', label: '0x1018:1 Vendor ID',        build: (n) => sdoRead(n, 0x1018, 1) },
  { group: 'Controlword 0x6040', label: 'Shutdown (0x0006)',         build: (n) => sdoWrite16(n, 0x6040, 0, 0x0006) },
  { group: 'Controlword 0x6040', label: 'Switch on (0x0007)',        build: (n) => sdoWrite16(n, 0x6040, 0, 0x0007) },
  { group: 'Controlword 0x6040', label: 'Enable operation (0x000F)', build: (n) => sdoWrite16(n, 0x6040, 0, 0x000F) },
  { group: 'Controlword 0x6040', label: 'Disable voltage (0x0000)',  build: (n) => sdoWrite16(n, 0x6040, 0, 0x0000) },
  { group: 'Controlword 0x6040', label: 'Quick stop (0x0002)',       build: (n) => sdoWrite16(n, 0x6040, 0, 0x0002) },
  { group: 'Controlword 0x6040', label: 'Fault reset (0x0080)',      build: (n) => sdoWrite16(n, 0x6040, 0, 0x0080) },
  { group: 'Heartbeat', label: '0x1017 Producer heartbeat 1000 ms', build: (n) => sdoWrite16(n, 0x1017, 0, 1000) },
];
