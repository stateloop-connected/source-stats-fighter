import { Rng, deriveSeed } from "./rng";
import { pUpper } from "./normal";
import { graphTest, type Step } from "./graph";
import type { Problem } from "./model";

/** Where an impact came from: the cannon's own reading and Ground Control's tracking. They add up to the impact. */
export interface ImpactParts {
  cannon: Float64Array;
  tracking: Float64Array;
  /** Ground Control's tracking error per class, in effect units (shared by all cannons). */
  trackError: Float64Array;
}

/**
 * Draw the impacts (test statistics) for one formation.
 * Each arm draws a vector of mean responses across classes with covariance R / energy;
 * the impact is the standardised difference between cannon and Ground Control.
 * With `parts`, the impact is also split into the cannon's part and the tracking part.
 */
export function drawShots(
  p: Problem,
  rng: Rng,
  out: Float64Array = new Float64Array(p.m),
  scratch: Float64Array = new Float64Array(p.K * 2),
  parts?: ImpactParts,
): Float64Array {
  const K = p.K;
  const gc = scratch.subarray(0, K);
  const tmp = scratch.subarray(K, 2 * K);
  mvn(p.chol, rng, tmp, gc);
  const sdG = p.gcEnergy > 0 ? 1 / Math.sqrt(p.gcEnergy) : 0;
  if (parts) for (let k = 0; k < K; k++) parts.trackError[k] = gc[k] * sdG;
  for (let c = 0; c < p.C; c++) {
    const n = p.energy[c];
    // always consume random numbers so streams stay aligned across designs
    mvn(p.chol, rng, tmp, tmp);
    for (let k = 0; k < K; k++) {
      const i = c * K + k;
      if (!(n > 0) || !(p.gcEnergy > 0)) {
        out[i] = -Infinity;
        if (parts) {
          parts.cannon[i] = -Infinity;
          parts.tracking[i] = 0;
        }
        continue;
      }
      const se = Math.sqrt(1 / n + 1 / p.gcEnergy);
      const xc = p.effects[i] + tmp[k] / Math.sqrt(n);
      const xg = gc[k] * sdG;
      out[i] = (xc - xg) / se;
      if (parts) {
        parts.cannon[i] = xc / se;
        parts.tracking[i] = -xg / se;
      }
    }
  }
  return out;
}

/** x = L z with z iid standard normal. `z` and `x` may be the same array. */
function mvn(L: number[][], rng: Rng, z: Float64Array, x: Float64Array) {
  const K = L.length;
  for (let k = 0; k < K; k++) z[k] = rng.normal();
  for (let i = K - 1; i >= 0; i--) {
    let s = 0;
    const row = L[i];
    for (let j = 0; j <= i; j++) s += row[j] * z[j];
    x[i] = s;
  }
}

export interface FormationResult {
  /** Impact per target. */
  shots: number[];
  /** The cannon's part of each impact. */
  cannonPart: number[];
  /** Ground Control's part of each impact (tracking). */
  trackingPart: number[];
  /** Ground Control's tracking error per class (effect units, shared by every lane). */
  trackError: number[];
  rejected: boolean[];
  order: number[];
  steps: Step[];
  finalWeights: number[];
  /** Per class: number of lanes (cannons) whose ship of that class was stopped. */
  stopped: number[];
  /** Targets that fell although the assumed effect is zero or less. */
  falseKills: number[];
}

/**
 * The counting rule. Each cannon faces its own ship of every class (its lane), and the ship
 * falls when its target falls. Adds the number of stopped ships per class to `tally`.
 */
export function countStopped(rejected: ArrayLike<boolean>, C: number, K: number, tally: number[]): number[] {
  for (let c = 0; c < C; c++) for (let k = 0; k < K; k++) if (rejected[c * K + k]) tally[k]++;
  return tally;
}

/** Ships of each class over a battle: one per cannon per formation. */
export function shipsPerClass(p: Pick<Problem, "C" | "formations">): number {
  return p.C * p.formations;
}

export function runFormation(p: Problem, rng: Rng, record = true): FormationResult {
  const parts: ImpactParts = { cannon: new Float64Array(p.m), tracking: new Float64Array(p.m), trackError: new Float64Array(p.K) };
  const z = drawShots(p, rng, undefined, undefined, parts);
  const pv = Array.from(z, pUpper);
  const g = graphTest(pv, p.weights, p.G, p.alpha, record);
  const stopped = countStopped(g.rejected, p.C, p.K, new Array<number>(p.K).fill(0));
  const falseKills: number[] = [];
  for (let i = 0; i < p.m; i++) if (g.rejected[i] && p.effects[i] <= 0) falseKills.push(i);
  return {
    shots: Array.from(z),
    cannonPart: Array.from(parts.cannon),
    trackingPart: Array.from(parts.tracking),
    trackError: Array.from(parts.trackError),
    rejected: g.rejected,
    order: g.order,
    steps: g.steps,
    finalWeights: g.finalWeights,
    stopped,
    falseKills,
  };
}

/** Number of stopped ships needed to meet a goal out of n ships. */
export function goalCount(goal: number, n: number): number {
  return Math.ceil(goal * n - 1e-9);
}

export interface BattleResult {
  seed: number;
  formations: FormationResult[];
  /** Ships stopped per class, over all lanes. */
  tally: number[];
  /** Ships per class over the battle. */
  ships: number;
  goalMet: boolean[];
  allPrimaryMet: boolean;
}

export function runBattle(p: Problem, seed: number): BattleResult {
  const rng = new Rng(seed);
  const formations: FormationResult[] = [];
  const tally = new Array(p.K).fill(0);
  for (let f = 0; f < p.formations; f++) {
    const r = runFormation(p, rng, true);
    r.stopped.forEach((s, k) => (tally[k] += s));
    formations.push(r);
  }
  const ships = shipsPerClass(p);
  const goalMet = tally.map((t, k) => t >= goalCount(p.goals[k], ships));
  const allPrimaryMet = goalMet.every((m, k) => m || !p.primary[k]);
  return { seed, formations, tally, ships, goalMet, allPrimaryMet };
}

export interface SimResult {
  battles: number;
  formations: number;
  /** Ships of each class per battle (cannons × formations). */
  ships: number;
  /** Share of formations in which each target fell. */
  targetFall: number[];
  /** Share of ships of each class stopped, over all lanes. */
  classStop: number[];
  /** Share of battles in which each class goal was met. */
  goalMet: number[];
  /** Share of battles in which all primary goals were met. */
  allPrimary: number;
  /** Share of formations with at least one false kill (null if no target has effect <= 0). */
  falseKill: number | null;
  /** Mean share of the swarm left stranded on targets that did not fall. */
  stranded: number;
}

export function simulate(p: Problem, battles: number, seed: number, onProgress?: (done: number) => void): SimResult {
  const N = p.formations;
  const fall = new Array(p.m).fill(0);
  const stop = new Array(p.K).fill(0);
  const goal = new Array(p.K).fill(0);
  let allPrimary = 0;
  let falseKill = 0;
  let stranded = 0;
  const hasNull = p.effects.some((e) => e <= 0);
  const ships = shipsPerClass(p);
  const need = p.goals.map((g) => goalCount(g, ships));
  const z = new Float64Array(p.m);
  const scratch = new Float64Array(p.K * 2);
  const pv = new Float64Array(p.m);
  const tally = new Array(p.K).fill(0);
  for (let b = 0; b < battles; b++) {
    const rng = new Rng(deriveSeed(seed, b));
    tally.fill(0);
    for (let f = 0; f < N; f++) {
      drawShots(p, rng, z, scratch);
      for (let i = 0; i < p.m; i++) pv[i] = pUpper(z[i]);
      const g = graphTest(pv, p.weights, p.G, p.alpha, false);
      let fk = false;
      for (let i = 0; i < p.m; i++) {
        if (g.rejected[i]) {
          fall[i]++;
          if (p.effects[i] <= 0) fk = true;
        } else stranded += g.finalWeights[i];
      }
      if (fk) falseKill++;
      countStopped(g.rejected, p.C, p.K, tally);
    }
    let ok = true;
    for (let k = 0; k < p.K; k++) {
      stop[k] += tally[k];
      const met = tally[k] >= need[k];
      if (met) goal[k]++;
      if (p.primary[k] && !met) ok = false;
    }
    if (ok) allPrimary++;
    if (onProgress && (b + 1) % 200 === 0) onProgress(b + 1);
  }
  const nf = battles * N;
  return {
    battles,
    formations: N,
    ships,
    targetFall: fall.map((x) => x / nf),
    classStop: stop.map((x) => x / (battles * ships)),
    goalMet: goal.map((x) => x / battles),
    allPrimary: allPrimary / battles,
    falseKill: hasNull ? falseKill / nf : null,
    stranded: stranded / nf,
  };
}

/** Monte Carlo standard error of a proportion. */
export function mcse(p: number, n: number): number {
  return n > 0 ? Math.sqrt(Math.max(p * (1 - p), 0) / n) : 0;
}
