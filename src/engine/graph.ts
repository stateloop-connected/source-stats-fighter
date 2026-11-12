/**
 * Bonferroni-based graphical multiple testing procedure (Bretz et al. 2009, Algorithm 1).
 * Game terms: weights = drone shares, G = wormhole routes, rejection = target falls.
 */

export interface Release {
  to: number;
  amount: number;
}

export interface Step {
  /** Target that fell. */
  target: number;
  /** Its share of the swarm at the moment it fell. */
  weight: number;
  /** Drones passed on through wormholes (share of the swarm). */
  released: Release[];
  /** Drones lost because the outgoing routes did not cover 100%. */
  lost: number;
  /** Shares on all targets after the drones arrived. */
  weightsAfter: number[];
}

export interface GraphResult {
  rejected: boolean[];
  order: number[];
  steps: Step[];
  finalWeights: number[];
}

/**
 * Remove hypothesis j from the graph in place: pass its weight along its outgoing edges and
 * update the transition matrix. Returns the amounts released to each remaining hypothesis.
 */
export function removeNode(w: number[], G: number[][], active: boolean[], j: number): Release[] {
  const m = w.length;
  active[j] = false;
  const released: Release[] = [];
  const wj = w[j];
  for (let l = 0; l < m; l++) {
    if (!active[l]) continue;
    const a = wj * G[j][l];
    if (a > 0) {
      w[l] += a;
      released.push({ to: l, amount: a });
    }
  }
  const Gn = G.map((r) => r.slice());
  for (let l = 0; l < m; l++) {
    if (!active[l]) continue;
    for (let k = 0; k < m; k++) {
      if (!active[k] || k === l) {
        Gn[l][k] = 0;
        continue;
      }
      const denom = 1 - G[l][j] * G[j][l];
      Gn[l][k] = denom > 1e-12 ? (G[l][k] + G[l][j] * G[j][k]) / denom : 0;
    }
  }
  for (let i = 0; i < m; i++) {
    Gn[j][i] = 0;
    Gn[i][j] = 0;
  }
  for (let i = 0; i < m; i++) G[i] = Gn[i];
  w[j] = 0;
  return released;
}

/** Run the sequentially rejective procedure on one-sided p-values. */
export function graphTest(p: ArrayLike<number>, w0: ArrayLike<number>, G0: number[][], alpha: number, record = false): GraphResult {
  const m = w0.length;
  const w = Array.from(w0);
  const G = G0.map((r) => r.slice());
  const active = new Array<boolean>(m).fill(true);
  const rejected = new Array<boolean>(m).fill(false);
  const order: number[] = [];
  const steps: Step[] = [];
  for (;;) {
    let best = -1;
    let bestRatio = Infinity;
    for (let i = 0; i < m; i++) {
      if (!active[i] || !(w[i] > 0)) continue;
      const thr = w[i] * alpha;
      if (p[i] <= thr * (1 + 1e-12)) {
        const r = p[i] / thr;
        if (r < bestRatio) {
          bestRatio = r;
          best = i;
        }
      }
    }
    if (best < 0) break;
    const weight = w[best];
    rejected[best] = true;
    order.push(best);
    const released = removeNode(w, G, active, best);
    if (record) {
      const passed = released.reduce((s, r) => s + r.amount, 0);
      steps.push({ target: best, weight, released, lost: Math.max(0, weight - passed), weightsAfter: w.slice() });
    }
  }
  return { rejected, order, steps, finalWeights: w };
}

export interface ValidationIssue {
  level: "error" | "warning";
  message: string;
}

/** Check weights and transition matrix. `names` are used in messages. */
export function validateGraph(w: number[], G: number[][], names: string[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;
  const total = w.reduce((s, x) => s + x, 0);
  if (w.some((x) => x < 0)) issues.push({ level: "error", message: "A target has a negative share of the swarm." });
  if (total > 1 + 1e-9) issues.push({ level: "error", message: `The swarm is over-committed: ${pct(total)} assigned, but Command only provides 100%.` });
  else if (total < 1 - 1e-9) issues.push({ level: "warning", message: `${pct(1 - total)} of the swarm is not assigned to any target. Those drones sit idle.` });
  for (let i = 0; i < w.length; i++) {
    const row = G[i];
    if (row[i] !== 0) issues.push({ level: "error", message: `${names[i]} has a wormhole to itself.` });
    if (row.some((x) => x < 0)) issues.push({ level: "error", message: `${names[i]} has a route with a negative share.` });
    const out = row.reduce((s, x) => s + x, 0);
    if (out > 1 + 1e-9) issues.push({ level: "error", message: `Routes out of ${names[i]} add up to ${pct(out)}; at most 100% of its drones can leave.` });
  }
  if (total === 0) return [{ level: "error", message: "No drones are assigned. Without drones nothing can fall." }, ...issues.filter((i) => i.level === "error")];
  return issues;
}
