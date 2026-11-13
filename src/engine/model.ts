import { cholesky } from "./normal";
import { validateGraph, type ValidationIssue } from "./graph";

/* ---------- Scenario: what is given to the commander ---------- */

export interface Cannon {
  id: string;
  name: string;
  weapon: string;
}

export interface ShipClass {
  id: string;
  name: string;
  /** Share of this class to be stopped over the battle (0..1). */
  goal: number;
  primary: boolean;
}

export interface Intel {
  guess: number;
  low: number;
  high: number;
}

export interface Scenario {
  name: string;
  cannons: Cannon[];
  classes: ShipClass[];
  /** True effectiveness per target key `${cannonId}:${classId}` (standardised effect size). */
  trueEffect: Record<string, number>;
  intel: Record<string, Intel>;
  /** Correlation between classes, key `${classIdA}|${classIdB}` with A before B in class order. */
  classCorrelation: Record<string, number>;
  formations: number;
  alpha: number;
  energyAvailable: number;
  hideTruth: boolean;
}

/* ---------- Design: what the commander decides ---------- */

export interface Route {
  from: string;
  to: string;
  share: number;
  /** Position of the share label relative to the default midpoint of the edge, if the player moved it. */
  label?: { x: number; y: number };
}

export interface Design {
  name: string;
  /** Energy per cannon id, and for Ground Control under the key "gc". */
  energy: Record<string, number>;
  /** Initial share of the swarm per target key. */
  weights: Record<string, number>;
  routes: Route[];
}

export const GC = "gc";
export const MAX_CANNONS = 3;
export const MAX_CLASSES = 4;

export const targetKey = (cannonId: string, classId: string) => `${cannonId}:${classId}`;
export const corrKey = (a: string, b: string) => `${a}|${b}`;

export interface TargetInfo {
  key: string;
  index: number;
  c: number;
  k: number;
  cannon: Cannon;
  cls: ShipClass;
  label: string;
}

/** Targets in engine order: index = c * K + k. */
export function targets(s: Scenario): TargetInfo[] {
  const out: TargetInfo[] = [];
  s.cannons.forEach((cannon, c) =>
    s.classes.forEach((cls, k) => {
      out.push({ key: targetKey(cannon.id, cls.id), index: c * s.classes.length + k, c, k, cannon, cls, label: `${cannon.name} ▸ ${cls.name}` });
    }),
  );
  return out;
}

export function correlationMatrix(s: Scenario): number[][] {
  const K = s.classes.length;
  const R: number[][] = Array.from({ length: K }, (_, i) => Array.from({ length: K }, (_, j) => (i === j ? 1 : 0)));
  for (let i = 0; i < K; i++)
    for (let j = i + 1; j < K; j++) {
      const v = s.classCorrelation[corrKey(s.classes[i].id, s.classes[j].id)] ?? 0;
      R[i][j] = R[j][i] = v;
    }
  return R;
}

export function designArrays(s: Scenario, d: Design): { w: number[]; G: number[][] } {
  const ts = targets(s);
  const idx = new Map(ts.map((t) => [t.key, t.index]));
  const w = ts.map((t) => d.weights[t.key] ?? 0);
  const G = ts.map(() => new Array(ts.length).fill(0));
  for (const r of d.routes) {
    const i = idx.get(r.from);
    const j = idx.get(r.to);
    if (i === undefined || j === undefined) continue;
    G[i][j] += r.share;
  }
  return { w, G };
}

export function energyUsed(s: Scenario, d: Design): number {
  return s.cannons.reduce((sum, c) => sum + (d.energy[c.id] ?? 0), 0) + (d.energy[GC] ?? 0);
}

/* ---------- Compiled problem for the engine ---------- */

export interface Problem {
  C: number;
  K: number;
  m: number;
  /** Assumed effect per target (engine order). */
  effects: number[];
  energy: number[];
  gcEnergy: number;
  /** Cholesky factor of the class correlation matrix. */
  chol: number[][];
  weights: number[];
  G: number[][];
  alpha: number;
  formations: number;
  goals: number[];
  primary: boolean[];
}

export type Assumption = "intel" | "intelLow" | "truth" | "custom";

export function effectsFor(s: Scenario, assumption: Assumption, custom?: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of targets(s)) {
    const intel = s.intel[t.key] ?? { guess: 0, low: 0, high: 0 };
    out[t.key] =
      assumption === "truth" ? (s.trueEffect[t.key] ?? 0) : assumption === "intel" ? intel.guess : assumption === "intelLow" ? intel.low : (custom?.[t.key] ?? intel.guess);
  }
  return out;
}

export function compile(s: Scenario, d: Design, effects: Record<string, number>): Problem {
  const ts = targets(s);
  const { w, G } = designArrays(s, d);
  const chol = cholesky(correlationMatrix(s));
  if (!chol) throw new Error("The correlation between ship classes is not valid.");
  return {
    C: s.cannons.length,
    K: s.classes.length,
    m: ts.length,
    effects: ts.map((t) => effects[t.key] ?? 0),
    energy: s.cannons.map((c) => d.energy[c.id] ?? 0),
    gcEnergy: d.energy[GC] ?? 0,
    chol,
    weights: w,
    G,
    alpha: s.alpha,
    formations: s.formations,
    goals: s.classes.map((c) => c.goal),
    primary: s.classes.map((c) => c.primary),
  };
}

/** Information of a cannon's comparison with Ground Control: 1 / (1/n + 1/m). */
export function information(n: number, m: number): number {
  if (!(n > 0) || !(m > 0)) return 0;
  return 1 / (1 / n + 1 / m);
}

export function validateDesign(s: Scenario, d: Design): ValidationIssue[] {
  const ts = targets(s);
  const { w, G } = designArrays(s, d);
  const issues = validateGraph(
    w,
    G,
    ts.map((t) => t.label),
  );
  const seen = new Set<string>();
  for (const r of d.routes) {
    const k = `${r.from}>${r.to}`;
    if (seen.has(k)) issues.push({ level: "error", message: "Two wormholes connect the same pair of targets in the same direction." });
    seen.add(k);
  }
  const used = energyUsed(s, d);
  if (used > s.energyAvailable + 1e-9) issues.push({ level: "error", message: `Energy allocated (${used}) exceeds what is available (${s.energyAvailable}).` });
  if (!((d.energy[GC] ?? 0) > 0)) issues.push({ level: "error", message: "Ground Control has no energy. Without tracking, no cannon can hit anything." });
  s.cannons.forEach((c) => {
    if (!((d.energy[c.id] ?? 0) > 0)) issues.push({ level: "warning", message: `${c.name} has no energy and will not fire.` });
  });
  if (!cholesky(correlationMatrix(s))) issues.push({ level: "error", message: "The correlations between ship classes are not consistent with each other (matrix is not positive definite)." });
  if (!(s.alpha > 0 && s.alpha < 0.5)) issues.push({ level: "error", message: "Swarm size must be between 0 and 50%." });
  if (!(s.formations >= 1)) issues.push({ level: "error", message: "The battle needs at least one formation." });
  return issues;
}

/* ---------- Default scenario ---------- */

export function defaultScenario(): Scenario {
  const cannons: Cannon[] = [
    { id: "c1", name: "Plasma Lance", weapon: "plasma" },
    { id: "c2", name: "Ion Disruptor", weapon: "ion" },
  ];
  const classes: ShipClass[] = [
    { id: "k1", name: "Attack", goal: 0.8, primary: true },
    { id: "k2", name: "Recon", goal: 0.6, primary: false },
    { id: "k3", name: "Supply", goal: 0.5, primary: false },
  ];
  const T = (c: string, k: string) => targetKey(c, k);
  return {
    name: "Default: Operation First Light",
    cannons,
    classes,
    trueEffect: {
      [T("c1", "k1")]: 0.42,
      [T("c1", "k2")]: 0.3,
      [T("c1", "k3")]: 0,
      [T("c2", "k1")]: 0.34,
      [T("c2", "k2")]: 0.36,
      [T("c2", "k3")]: 0.3,
    },
    intel: {
      [T("c1", "k1")]: { guess: 0.45, low: 0.3, high: 0.55 },
      [T("c1", "k2")]: { guess: 0.25, low: 0.1, high: 0.4 },
      [T("c1", "k3")]: { guess: 0.35, low: 0.15, high: 0.45 },
      [T("c2", "k1")]: { guess: 0.3, low: 0.15, high: 0.45 },
      [T("c2", "k2")]: { guess: 0.4, low: 0.25, high: 0.5 },
      [T("c2", "k3")]: { guess: 0.25, low: 0.1, high: 0.4 },
    },
    classCorrelation: { [corrKey("k1", "k2")]: 0.3, [corrKey("k1", "k3")]: 0.3, [corrKey("k2", "k3")]: 0.3 },
    formations: 20,
    alpha: 0.025,
    energyAvailable: 360,
    hideTruth: true,
  };
}

export function defaultDesign(): Design {
  const T = (c: string, k: string) => targetKey(c, k);
  return {
    name: "Opening gambit",
    energy: { c1: 110, c2: 110, [GC]: 110 },
    weights: { [T("c1", "k1")]: 0.5, [T("c2", "k1")]: 0.5 },
    routes: [
      { from: T("c1", "k1"), to: T("c1", "k3"), share: 1 },
      { from: T("c1", "k3"), to: T("c1", "k2"), share: 1 },
      { from: T("c2", "k1"), to: T("c2", "k2"), share: 1 },
      { from: T("c2", "k2"), to: T("c2", "k3"), share: 1 },
    ],
  };
}
