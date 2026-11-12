import { Rng, deriveSeed } from "./rng";
import { pUpper } from "./normal";
import { graphTest, type Step } from "./graph";
import type { Problem } from "./model";

/**
 * Draw the shot strengths (test statistics) for one formation.
 * Each arm draws a vector of mean responses across classes with covariance R / energy;
 * the statistic is the standardised difference between cannon and Ground Control.
 */
export function drawShots(p: Problem, rng: Rng, out: Float64Array = new Float64Array(p.m), scratch: Float64Array = new Float64Array(p.K * 2)): Float64Array {
  const K = p.K;
  const gc = scratch.subarray(0, K);
  const tmp = scratch.subarray(K, 2 * K);
  mvn(p.chol, rng, tmp, gc);
  const sdG = p.gcEnergy > 0 ? 1 / Math.sqrt(p.gcEnergy) : 0;
  for (let c = 0; c < p.C; c++) {
    const n = p.energy[c];
    // always consume random numbers so streams stay aligned across designs
    mvn(p.chol, rng, tmp, tmp);
    for (let k = 0; k < K; k++) {
      const i = c * K + k;
      if (!(n > 0) || !(p.gcEnergy > 0)) {
        out[i] = -Infinity;
        continue;
      }
      const se = Math.sqrt(1 / n + 1 / p.gcEnergy);
      const xc = p.effects[i] + tmp[k] / Math.sqrt(n);
      const xg = gc[k] * sdG;
      out[i] = (xc - xg) / se;
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
  shots: number[];
  rejected: boolean[];
  order: number[];
  steps: Step[];
  finalWeights: number[];
  /** Per class: stopped by at least one cannon. */
  stopped: boolean[];
  /** Targets that fell although the assumed effect is zero or less. */
  falseKills: number[];
}

export function runFormation(p: Problem, rng: Rng, record = true): FormationResult {
  const z = drawShots(p, rng);
  const pv = Array.from(z, pUpper);
  const g = graphTest(pv, p.weights, p.G, p.alpha, record);
  const stopped = new Array<boolean>(p.K).fill(false);
  const falseKills: number[] = [];
  for (let i = 0; i < p.m; i++) {
    if (!g.rejected[i]) continue;
    stopped[i % p.K] = true;
    if (p.effects[i] <= 0) falseKills.push(i);
  }
  return { shots: Array.from(z), rejected: g.rejected, order: g.order, steps: g.steps, finalWeights: g.finalWeights, stopped, falseKills };
}

/** Number of stopped ships needed to meet a goal over n formations. */
export function goalCount(goal: number, n: number): number {
  return Math.ceil(goal * n - 1e-9);
}

export interface BattleResult {
  seed: number;
  formations: FormationResult[];
  tally: number[];
  goalMet: boolean[];
  allPrimaryMet: boolean;
}

export function runBattle(p: Problem, seed: number): BattleResult {
  const rng = new Rng(seed);
  const formations: FormationResult[] = [];
  const tally = new Array(p.K).fill(0);
  for (let f = 0; f < p.formations; f++) {
    const r = runFormation(p, rng, true);
    r.stopped.forEach((s, k) => (tally[k] += s ? 1 : 0));
    formations.push(r);
  }
  const goalMet = tally.map((t, k) => t >= goalCount(p.goals[k], p.formations));
  const allPrimaryMet = goalMet.every((m, k) => m || !p.primary[k]);
  return { seed, formations, tally, goalMet, allPrimaryMet };
}

export interface SimResult {
  battles: number;
  formations: number;
  /** Share of formations in which each target fell. */
  targetFall: number[];
  /** Share of formations in which each class was stopped. */
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
  const need = p.goals.map((g) => goalCount(g, N));
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
      const stoppedNow = new Array(p.K).fill(false);
      for (let i = 0; i < p.m; i++) {
        if (g.rejected[i]) {
          fall[i]++;
          stoppedNow[i % p.K] = true;
          if (p.effects[i] <= 0) fk = true;
        } else stranded += g.finalWeights[i];
      }
      if (fk) falseKill++;
      for (let k = 0; k < p.K; k++) if (stoppedNow[k]) tally[k]++;
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
    targetFall: fall.map((x) => x / nf),
    classStop: stop.map((x) => x / nf),
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
