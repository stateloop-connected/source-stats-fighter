import type { SimResult } from "../engine/battle";
import type { Problem } from "../engine/model";
import type { SimRequest, SimResponse } from "./sim.worker";

interface Channel {
  worker: Worker | null;
  reject: ((e: Error) => void) | null;
}
const channels = new Map<string, Channel>();
let nextId = 1;

/** Run simulations in a worker. A new call on the same channel cancels the previous one. */
export function runSimulation(channel: string, problems: Problem[], battles: number, seed: number, onProgress?: (frac: number) => void): Promise<SimResult[]> {
  let ch = channels.get(channel);
  if (!ch) channels.set(channel, (ch = { worker: null, reject: null }));
  if (ch.reject) {
    ch.worker?.terminate();
    ch.worker = null;
    ch.reject(new Error("cancelled"));
    ch.reject = null;
  }
  if (!ch.worker) ch.worker = new Worker(new URL("./sim.worker.ts", import.meta.url), { type: "module" });
  const w = ch.worker;
  const c = ch;
  const id = nextId++;
  return new Promise((resolve, reject) => {
    c.reject = reject;
    w.onmessage = (e: MessageEvent<SimResponse>) => {
      const msg = e.data;
      if (msg.id !== id) return;
      if (msg.type === "progress") onProgress?.(msg.done / msg.total);
      else if (msg.type === "result") {
        c.reject = null;
        resolve(msg.results);
      } else {
        c.reject = null;
        reject(new Error(msg.message));
      }
    };
    w.onerror = (e) => {
      c.reject = null;
      reject(new Error(e.message || "Simulation failed"));
    };
    w.postMessage({ id, problems, battles, seed } satisfies SimRequest);
  });
}
