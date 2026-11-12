import { simulate, type SimResult } from "../engine/battle";
import type { Problem } from "../engine/model";

export interface SimRequest {
  id: number;
  problems: Problem[];
  battles: number;
  seed: number;
}

export type SimResponse = { id: number; type: "progress"; done: number; total: number } | { id: number; type: "result"; results: SimResult[] } | { id: number; type: "error"; message: string };

self.onmessage = (e: MessageEvent<SimRequest>) => {
  const { id, problems, battles, seed } = e.data;
  try {
    const total = battles * problems.length;
    const results: SimResult[] = [];
    problems.forEach((p, i) => {
      results.push(
        simulate(p, battles, seed, (done) => {
          (self as unknown as Worker).postMessage({ id, type: "progress", done: i * battles + done, total } satisfies SimResponse);
        }),
      );
    });
    (self as unknown as Worker).postMessage({ id, type: "result", results } satisfies SimResponse);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, type: "error", message: (err as Error).message } satisfies SimResponse);
  }
};
