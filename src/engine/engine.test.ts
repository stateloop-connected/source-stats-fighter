import { describe, expect, it } from "vitest";
import { pnorm, qnorm, shield, binomUpper, cholesky } from "./normal";
import { graphTest, removeNode, validateGraph } from "./graph";
import { Rng, deriveSeed } from "./rng";
import { drawShots, simulate, runBattle, runFormation, goalCount, mcse, type SimResult } from "./battle";
import { compile, defaultDesign, defaultScenario, effectsFor, information, type Problem } from "./model";
import { fromJSON, toJSON, toR, toTikZ } from "./export";

/* ---------- helpers ---------- */

function holm(p: number[], alpha: number): boolean[] {
  const m = p.length;
  const idx = p.map((_, i) => i).sort((a, b) => p[a] - p[b]);
  const rej = new Array(m).fill(false);
  for (let r = 0; r < m; r++) {
    if (p[idx[r]] <= alpha / (m - r)) rej[idx[r]] = true;
    else break;
  }
  return rej;
}

function holmGraph(m: number) {
  const w = new Array(m).fill(1 / m);
  const G = Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, j) => (i === j ? 0 : 1 / (m - 1))));
  return { w, G };
}

function fixedSequence(m: number) {
  const w = new Array(m).fill(0);
  w[0] = 1;
  const G: number[][] = Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, j) => (j === i + 1 ? 1 : 0)));
  return { w, G };
}

/** Closed testing with weighted Bonferroni tests, intersection weights derived from the graph. */
function closedTest(p: number[], w0: number[], G0: number[][], alpha: number): boolean[] {
  const m = p.length;
  const rejectedIntersection = new Map<number, boolean>();
  for (let J = 1; J < 1 << m; J++) {
    const w = w0.slice();
    const G = G0.map((r) => r.slice());
    const active = new Array(m).fill(true);
    for (let i = 0; i < m; i++) if (!(J & (1 << i))) removeNode(w, G, active, i);
    let rej = false;
    for (let i = 0; i < m; i++) if (J & (1 << i) && w[i] > 0 && p[i] <= w[i] * alpha * (1 + 1e-12)) rej = true;
    rejectedIntersection.set(J, rej);
  }
  return p.map((_, i) => {
    for (let J = 1; J < 1 << m; J++) if (J & (1 << i) && !rejectedIntersection.get(J)) return false;
    return true;
  });
}

function randomGraph(rng: Rng, m: number) {
  const raw: number[] = Array.from({ length: m }, () => (rng.uniform() < 0.3 ? 0 : rng.uniform()));
  if (!raw.some((x) => x > 0)) raw[0] = 1;
  const tot = raw.reduce((a, b) => a + b, 0);
  const w = raw.map((x) => x / tot);
  const G = Array.from({ length: m }, (_, i) => {
    const row = Array.from({ length: m }, (_, j) => (i === j || rng.uniform() < 0.4 ? 0 : rng.uniform()));
    const s = row.reduce((a, b) => a + b, 0);
    const scale = s > 0 ? (rng.uniform() < 0.7 ? 1 : rng.uniform()) / s : 0;
    return row.map((x) => x * scale);
  });
  return { w, G };
}

function singleTargetProblem(effect: number, n: number, gc: number, formations = 20, goal = 0.8): Problem {
  return {
    C: 1,
    K: 1,
    m: 1,
    effects: [effect],
    energy: [n],
    gcEnergy: gc,
    chol: [[1]],
    weights: [1],
    G: [[0]],
    alpha: 0.025,
    formations,
    goals: [goal],
    primary: [true],
  };
}

/* ---------- normal distribution ---------- */

describe("normal distribution", () => {
  it("matches reference values", () => {
    expect(pnorm(0)).toBeCloseTo(0.5, 14);
    expect(pnorm(1.959963984540054)).toBeCloseTo(0.975, 12);
    expect(pnorm(-3)).toBeCloseTo(0.0013498980316301, 13);
    expect(pnorm(8)).toBeCloseTo(1, 14);
    expect(qnorm(0.975)).toBeCloseTo(1.959963984540054, 10);
    expect(qnorm(1e-10)).toBeCloseTo(-6.361340902404056, 8);
    for (const p of [1e-6, 0.01, 0.2, 0.5, 0.8, 0.99, 1 - 1e-6]) expect(pnorm(qnorm(p))).toBeCloseTo(p, 12);
  });

  it("gives the shield strengths quoted in the concept", () => {
    expect(shield(1, 0.025)).toBeCloseTo(1.96, 2);
    expect(shield(0.5, 0.025)).toBeCloseTo(2.24, 2);
    expect(shield(0.1, 0.025)).toBeCloseTo(2.81, 2);
    expect(shield(0, 0.025)).toBe(Infinity);
  });

  it("gives the goal probabilities quoted in the concept (20 formations, 80% goal)", () => {
    expect(binomUpper(16, 20, 0.9)).toBeCloseTo(0.957, 3);
    expect(binomUpper(16, 20, 0.8)).toBeCloseTo(0.63, 2);
  });

  it("factors a correlation matrix", () => {
    const L = cholesky([
      [1, 0.5],
      [0.5, 1],
    ])!;
    expect(L[1][0]).toBeCloseTo(0.5, 12);
    expect(L[1][1]).toBeCloseTo(Math.sqrt(0.75), 12);
    expect(
      cholesky([
        [1, 0.9, -0.9],
        [0.9, 1, 0.9],
        [-0.9, 0.9, 1],
      ]),
    ).toBeNull();
  });

  it("computes information as in the concept", () => {
    expect(information(100, 100)).toBe(50);
    expect(information(100, 25)).toBe(20);
  });
});

/* ---------- graphical procedure ---------- */

describe("graphical procedure", () => {
  it("worked example: two doses, primary and secondary endpoints (Bretz et al. 2009 structure)", () => {
    // H1, H2 primary (dose 1, dose 2); H3, H4 secondary. H1 -> H3, H2 -> H4, H3 -> H2, H4 -> H1.
    const w = [0.5, 0.5, 0, 0];
    const G = [
      [0, 0, 1, 0],
      [0, 0, 0, 1],
      [0, 1, 0, 0],
      [1, 0, 0, 0],
    ];
    const r = graphTest([0.01, 0.02, 0.005, 0.5], w, G, 0.025, true);
    expect(r.rejected).toEqual([true, true, true, false]);
    expect(r.order).toEqual([0, 2, 1]);
    // H2 ends with the whole alpha, passes it all to H4, which stays unrejected holding everything
    expect(r.finalWeights[3]).toBeCloseTo(1, 12);
    expect(r.steps[0].released).toEqual([{ to: 2, amount: 0.5 }]);
  });

  it("worked example: Holm with four hypotheses", () => {
    const { w, G } = holmGraph(4);
    // sorted: .01 <= .0125 reject; .02 > .01667 stop
    expect(graphTest([0.01, 0.07, 0.02, 0.05], w, G, 0.05).rejected).toEqual([true, false, false, false]);
    // .005<=.0125, .01<=.0167, .02<=.025, .04<=.05
    expect(graphTest([0.02, 0.04, 0.005, 0.01], w, G, 0.05).rejected).toEqual([true, true, true, true]);
  });

  it("worked example: fixed sequence stops at the first failure", () => {
    const { w, G } = fixedSequence(4);
    expect(graphTest([0.01, 0.02, 0.03, 0.001], w, G, 0.025).rejected).toEqual([true, true, false, false]);
    expect(graphTest([0.03, 0.001, 0.001, 0.001], w, G, 0.025).rejected).toEqual([false, false, false, false]);
  });

  it("worked example: fallback procedure (Wiens) passes unused alpha forward", () => {
    // w = (.5, .3, .2), chain H1 -> H2 -> H3, H3 -> H1
    const w = [0.5, 0.3, 0.2];
    const G = [
      [0, 1, 0],
      [0, 0, 1],
      [1, 0, 0],
    ];
    // H1: .02 > .0125. H2: .0074 <= .0075 reject -> H3 gets .5 total -> .0125; H3: .012 reject -> H1 gets 1 -> .025; H1 .02 reject
    expect(graphTest([0.02, 0.0074, 0.012], w, G, 0.025).rejected).toEqual([true, true, true]);
  });

  it("agrees with Holm on random p-values", () => {
    const rng = new Rng(1);
    for (const m of [2, 3, 5, 8]) {
      const { w, G } = holmGraph(m);
      for (let t = 0; t < 400; t++) {
        const p = Array.from({ length: m }, () => rng.uniform() * 0.08);
        expect(graphTest(p, w, G, 0.05).rejected).toEqual(holm(p, 0.05));
      }
    }
  });

  it("agrees with closed testing on random graphs", () => {
    const rng = new Rng(7);
    for (let t = 0; t < 300; t++) {
      const m = 2 + (t % 4);
      const { w, G } = randomGraph(rng, m);
      const p = Array.from({ length: m }, () => rng.uniform() * 0.06);
      expect(graphTest(p, w, G, 0.05).rejected).toEqual(closedTest(p, w, G, 0.05));
    }
  });

  it("never creates drones: shares only move or get lost", () => {
    const rng = new Rng(3);
    for (let t = 0; t < 200; t++) {
      const { w, G } = randomGraph(rng, 5);
      const p = Array.from({ length: 5 }, () => rng.uniform() * 0.03);
      const r = graphTest(p, w, G, 0.025, true);
      for (const s of r.steps) expect(s.weightsAfter.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it("reports invalid designs in plain words", () => {
    const names = ["A", "B"];
    expect(validateGraph([0.7, 0.5], [[0, 0], [0, 0]], names).some((i) => i.message.includes("over-committed"))).toBe(true);
    expect(validateGraph([0.5, 0.5], [[1, 0], [0, 0]], names).some((i) => i.message.includes("to itself"))).toBe(true);
    expect(validateGraph([0.5, 0.5], [[0, 1.2], [0, 0]], names).some((i) => i.message.includes("at most 100%"))).toBe(true);
    expect(validateGraph([0, 0], [[0, 0], [0, 0]], names)[0].message).toContain("No drones");
    expect(validateGraph([0.5, 0.5], [[0, 1], [1, 0]], names)).toEqual([]);
  });
});

/* ---------- statistical engine ---------- */

describe("battle engine", () => {
  it("matches closed-form power for a single target", () => {
    for (const [d, n] of [
      [0.3, 100],
      [0.45, 60],
    ]) {
      const p = singleTargetProblem(d, n, n);
      const res = simulate(p, 2000, 11);
      const power = pnorm(d * Math.sqrt(information(n, n)) - qnorm(1 - 0.025));
      expect(Math.abs(res.targetFall[0] - power)).toBeLessThan(4 * mcse(power, 40000));
    }
  });

  it("matches the binomial goal probability for a single target", () => {
    // choose an effect with power 0.9; 80% goal over 20 formations is met about 96% of the time
    const n = 100;
    const d = (qnorm(0.975) + qnorm(0.9)) / Math.sqrt(information(n, n));
    const res = simulate(singleTargetProblem(d, n, n), 4000, 5);
    expect(Math.abs(res.goalMet[0] - 0.957)).toBeLessThan(4 * mcse(0.957, 4000));
  });

  it("keeps false kills at or below the swarm size when every class is immune", () => {
    const rng = new Rng(99);
    const s = defaultScenario();
    const graphs = [holmGraph(6), fixedSequence(6), randomGraph(rng, 6), randomGraph(rng, 6)];
    for (const { w, G } of graphs) {
      const base = compile(s, defaultDesign(), effectsFor(s, "truth"));
      const p: Problem = { ...base, effects: new Array(6).fill(0), weights: w, G };
      const res: SimResult = simulate(p, 4000, 42);
      expect(res.falseKill).not.toBeNull();
      expect(res.falseKill!).toBeLessThanOrEqual(0.025 + 3 * mcse(0.025, 80000));
    }
  });

  it("produces correlation 0.5 between two cannons with equal energy and shared Ground Control", () => {
    const p: Problem = {
      C: 2,
      K: 1,
      m: 2,
      effects: [0, 0],
      energy: [80, 80],
      gcEnergy: 80,
      chol: [[1]],
      weights: [0.5, 0.5],
      G: [
        [0, 0],
        [0, 0],
      ],
      alpha: 0.025,
      formations: 1,
      goals: [0.5],
      primary: [true],
    };
    const rng = new Rng(2024);
    const n = 40000;
    let sx = 0,
      sy = 0,
      sxx = 0,
      syy = 0,
      sxy = 0;
    for (let i = 0; i < n; i++) {
      const z = drawShots(p, rng);
      sx += z[0];
      sy += z[1];
      sxx += z[0] * z[0];
      syy += z[1] * z[1];
      sxy += z[0] * z[1];
    }
    const cov = sxy / n - (sx / n) * (sy / n);
    const r = cov / Math.sqrt((sxx / n - (sx / n) ** 2) * (syy / n - (sy / n) ** 2));
    expect(Math.abs(r - 0.5)).toBeLessThan(0.02);
    expect(Math.abs(sxx / n - 1)).toBeLessThan(0.03);
  });

  it("counts ships over all lanes, the same way in battle and simulation", () => {
    const s = defaultScenario();
    const p = compile(s, defaultDesign(), effectsFor(s, "truth"));
    for (const seed of [1, 2, 3, 4, 5]) {
      const b = runBattle(p, deriveSeed(seed, 0));
      expect(b.ships).toBe(2 * s.formations);
      const lanes = s.classes.map((_, k) => b.formations.reduce((n, f) => n + (f.rejected[k] ? 1 : 0) + (f.rejected[3 + k] ? 1 : 0), 0));
      expect(b.tally).toEqual(lanes);
      expect(b.goalMet).toEqual(b.tally.map((t, k) => t >= goalCount(s.classes[k].goal, b.ships)));
      const one = simulate(p, 1, seed);
      expect(one.classStop.map((x) => Math.round(x * one.ships))).toEqual(b.tally);
    }
    const res = simulate(p, 300, 8);
    s.classes.forEach((_, k) => expect(res.classStop[k]).toBeCloseTo((res.targetFall[k] + res.targetFall[3 + k]) / 2, 12));
  });

  it("splits each impact into a cannon part and a tracking part shared across lanes", () => {
    const s = defaultScenario();
    const rng = new Rng(77);
    const equal = compile(s, defaultDesign(), effectsFor(s, "truth"));
    const unequal = compile(s, { ...defaultDesign(), energy: { c1: 60, c2: 150, gc: 90 } }, effectsFor(s, "truth"));
    for (let i = 0; i < 50; i++) {
      const f = runFormation(equal, rng, false);
      f.shots.forEach((z, j) => expect(f.cannonPart[j] + f.trackingPart[j]).toBeCloseTo(z, 10));
      for (let k = 0; k < 3; k++) expect(f.trackingPart[k]).toBeCloseTo(f.trackingPart[3 + k], 12);
      const g = runFormation(unequal, rng, false);
      g.shots.forEach((z, j) => expect(g.cannonPart[j] + g.trackingPart[j]).toBeCloseTo(z, 10));
      for (let c = 0; c < 2; c++)
        for (let k = 0; k < 3; k++) {
          const se = Math.sqrt(1 / unequal.energy[c] + 1 / unequal.gcEnergy);
          expect(g.trackingPart[c * 3 + k] * se).toBeCloseTo(-g.trackError[k], 10);
        }
    }
  });

  it("is reproducible from its seed", () => {
    const s = defaultScenario();
    const p = compile(s, defaultDesign(), effectsFor(s, "truth"));
    expect(runBattle(p, 123)).toEqual(runBattle(p, 123));
    expect(simulate(p, 300, 9)).toEqual(simulate(p, 300, 9));
  });

  it("the default scenario strands drones on the immune target", () => {
    const s = defaultScenario();
    const p = compile(s, defaultDesign(), effectsFor(s, "truth"));
    const res = simulate(p, 500, 1);
    expect(res.stranded).toBeGreaterThan(0.2);
    // Plasma vs Supply is immune: it falls only by false kill
    expect(res.targetFall[2]).toBeLessThan(0.03);
  });
});

/* ---------- export ---------- */

describe("export", () => {
  it("round-trips JSON and writes R and TikZ", () => {
    const s = defaultScenario();
    const d = defaultDesign();
    const back = fromJSON(toJSON(s, d));
    expect(back.scenario).toEqual(s);
    expect(back.design).toEqual(d);
    expect(() => fromJSON("{}")).toThrow();
    const r = toR(s, d);
    expect(r).toContain("matrix2graph(m, weights)");
    expect(r).toContain("graph_create(weights, m)");
    expect(r).toContain("weights <- setNames(c(0.5, 0, 0, 0.5, 0, 0), hyp)");
    const tex = toTikZ(s, d);
    expect(tex).toContain("\\begin{tikzpicture}");
    expect(tex.match(/\\draw\[edge\]/g)!.length).toBe(4);
  });

  it("upgrades version 1 files and rejects broken or newer ones", () => {
    const s = defaultScenario();
    const d = defaultDesign();
    const v1 = JSON.parse(toJSON(s, d));
    v1.version = 1;
    const up = fromJSON(JSON.stringify(v1));
    expect(up.version).toBe(2);
    expect(up.notes.length).toBe(1);
    expect(up.design).toEqual(d);
    const newer = { ...v1, version: 99 };
    expect(() => fromJSON(JSON.stringify(newer))).toThrow(/newer version/);
    const badGoal = JSON.parse(toJSON(s, d));
    badGoal.scenario.classes[0].goal = 3;
    expect(() => fromJSON(JSON.stringify(badGoal))).toThrow(/goal/);
    const badShare = JSON.parse(toJSON(s, d));
    badShare.design.routes[0].share = "lots";
    expect(() => fromJSON(JSON.stringify(badShare))).toThrow(/wormhole/);
  });
});
