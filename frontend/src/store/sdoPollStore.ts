/**
 * sdoPollStore.ts
 * ---------------
 * Periodic SDO reads for the plot ("Plot" in the EDS object list). Each
 * object is read about every 100 ms and its value (decoded with the EDS data
 * type by the backend) goes into the plot store as "SDO 0x0D.<name>".
 * The reads are sent with quiet: true, so they stay out of the SDO log.
 *
 * Objects are read one after another; a node answers one SDO at a time.
 */

import { create } from 'zustand';
import { BASE } from '../api/client';
import { addSignalValues, sdoMessageName, usePlotStore } from './plotStore';

export const SDO_POLL_INTERVAL_MS = 100;
const RETRY_INTERVAL_MS = 1000;   // after a failed round (not connected, no answer)

export interface PolledObject {
  nodeId:   number;
  index:    number;
  subindex: number;
  name:     string;
}

/** Plot key of a polled object, e.g. "SDO 0x0D.Vdc mV". */
export const polledKey = (o: PolledObject) => `${sdoMessageName(o.nodeId)}.${o.name}`;

interface SdoPollStore {
  objects: PolledObject[];
  /** Last read error, cleared by the next round that succeeds */
  error:   string | null;
  /** Start reading an object and plot it. */
  start:   (o: PolledObject) => void;
  /** Stop reading the object with this plot key. */
  stop:    (key: string) => void;
}

export const useSdoPollStore = create<SdoPollStore>((set, get) => ({
  objects: [],
  error:   null,

  start: (o) => {
    const key = polledKey(o);
    if (get().objects.some((x) => polledKey(x) === key)) return;
    set({ objects: [...get().objects, o] });
    const plot = usePlotStore.getState();
    if (!plot.selectedSignals.includes(key)) plot.toggleSignal(key);
    void runLoop();
  },

  stop: (key) => set((s) => ({
    objects: s.objects.filter((x) => polledKey(x) !== key),
    error:   s.objects.length > 1 ? s.error : null,
  })),
}));

/** Read one object; returns an error text or null. */
async function readOnce(o: PolledObject): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/canopen/sdo/read`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ node_id: o.nodeId, index: o.index, subindex: o.subindex, quiet: true }),
    });
    const data = await res.json();
    if (!res.ok) return data.detail ?? res.statusText;
    if (!data.ok) return data.detail ?? 'SDO abort';
    const value = data.value ?? data.value_int;
    if (value == null) return `${o.name}: not a number`;
    addSignalValues([{ name: o.name, message_name: sdoMessageName(o.nodeId), value }], Date.now() / 1000);
    return null;
  } catch {
    return 'Backend not reachable';
  }
}

let running = false;

async function runLoop(): Promise<void> {
  if (running) return;
  running = true;
  try {
    while (useSdoPollStore.getState().objects.length > 0) {
      const started = performance.now();
      let error: string | null = null;
      for (const o of useSdoPollStore.getState().objects) {
        error = (await readOnce(o)) ?? error;
      }
      useSdoPollStore.setState({ error });
      const wait = (error ? RETRY_INTERVAL_MS : SDO_POLL_INTERVAL_MS) - (performance.now() - started);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
  } finally {
    running = false;
  }
}
