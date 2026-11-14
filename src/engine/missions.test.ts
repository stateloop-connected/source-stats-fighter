import { describe, expect, it } from "vitest";
import { simulate } from "./battle";
import { compile, effectsFor, energyUsed, GC, targets, validateDesign, type Design, type Scenario } from "./model";
import { checkScenario, checkDesign } from "./migrate";
import { missions, type Mission } from "./missions";
import { missionScenario, sameTargets, startingDesigns, variantScenarios } from "./campaign";

/** Share of battles won under the true effects (of the base scenario, or of a given variant). */
function win(m: Mission, d: Design, battles = 4000, seed = 1989, sc: Scenario = m.scenario): number {
  return simulate(compile(sc, d, effectsFor(sc, "truth")), battles, seed).allPrimary;
}
const res = (sc: Scenario, d: Design, battles = 4000) => simulate(compile(sc, d, effectsFor(sc, "truth")), battles, 1989);

const equalSplit = (m: Mission, energy: Record<string, number>): Design => {
  const ks = targets(m.scenario).map((t) => t.key);
  return { name: "equal", energy, weights: Object.fromEntries(ks.map((k) => [k, 1 / ks.length])), routes: [] };
};

const [m1, m2, m3, m4, m5, m6, m7, m8] = missions();

describe("mission data", () => {
  it.each(missions().map((m) => [m.id, m] as const))("%s is well formed", (_, m) => {
    expect(() => checkScenario(JSON.parse(JSON.stringify(m.scenario)))).not.toThrow();
    expect(() => checkDesign(JSON.parse(JSON.stringify(m.rival)))).not.toThrow();
    expect(validateDesign(m.scenario, m.rival).filter((i) => i.level === "error")).toEqual([]);
    expect(energyUsed(m.scenario, m.rival)).toBeLessThanOrEqual(m.scenario.energyAvailable);
    expect(m.hints.length).toBeLessThanOrEqual(3);
    if (!m.rules.wormholes) expect(m.rival.routes).toEqual([]);
    expect(m.number).toBe(missions().findIndex((x) => x.id === m.id) + 1);
    // from mission 4 on: truth classified, intelligence only, no hints
    if (m.number >= 4) {
      expect(m.scenario.hideTruth).toBe(true);
      expect(m.rules.simulator).not.toContain("truth");
      expect(m.hints).toEqual([]);
    }
    // variants only change true effects, and stay within what intelligence states
    for (const v of m.variants ?? [])
      for (const [k, x] of Object.entries(v)) {
        expect(m.scenario.trueEffect[k], `${m.id} ${k}`).toBeDefined();
        expect(x).toBeGreaterThanOrEqual(m.scenario.intel[k].low);
        expect(x).toBeLessThanOrEqual(m.scenario.intel[k].high);
      }
  });

  it("missions 6 and 8 ration the simulator; the others do not", () => {
    expect(missions().filter((m) => m.rules.simAllowance).map((m) => m.id)).toEqual(["m6", "m8"]);
  });

  it("a run faces one variant per mission, the same every time it asks", () => {
    const seen = new Set<string>();
    for (let r = 0; r < 40; r++) {
      const a = missionScenario(m4, `run${r}`);
      expect(missionScenario(m4, `run${r}`)).toEqual(a);
      seen.add(JSON.stringify(a.trueEffect));
    }
    expect(seen.size).toBe(2);
  });
});

describe("balance checks", () => {
  it("every mission and every variant: the rival's design wins about 90% of the time", () => {
    for (const m of missions())
      variantScenarios(m).forEach((sc, v) => {
        const w = win(m, m.rival, 4000, 1989, sc);
        expect(w, `${m.id} variant ${v}`).toBeGreaterThan(0.86);
        expect(w, `${m.id} variant ${v}`).toBeLessThan(0.96);
      });
  });

  it("every mission with several targets: an equal split without wormholes does clearly worse than the rival", () => {
    for (const m of missions().filter((x) => targets(x.scenario).length > 1))
      variantScenarios(m).forEach((sc, v) => {
        expect(win(m, m.rival, 4000, 1989, sc) - win(m, equalSplit(m, m.rival.energy), 4000, 1989, sc), `${m.id} variant ${v}`).toBeGreaterThan(0.06);
      });
  });

  it("mission 1: balanced energy wins at least 90%, the same total with Ground Control starved wins less than 60%", () => {
    const d = (c: number, g: number): Design => ({ ...m1.rival, energy: { c1: c, [GC]: g } });
    expect(win(m1, d(150, 150))).toBeGreaterThanOrEqual(0.9);
    expect(win(m1, d(250, 50))).toBeLessThan(0.6);
  });

  it("mission 2: the split should follow the weapon's strengths", () => {
    const d = (w: number): Design => ({ ...m2.rival, weights: { "c1:k1": w, "c1:k2": 1 - w } });
    expect(win(m2, d(0.2))).toBeGreaterThan(win(m2, d(0.5)) + 0.05);
    expect(win(m2, d(0.2))).toBeGreaterThan(win(m2, d(0.8)) + 0.3);
  });

  it("mission 3: the best design with wormholes beats the best design without them on the same energy by a clear margin", () => {
    const E = m3.rival.energy;
    let bestWithout = 0;
    for (let w = 0.05; w < 0.96; w += 0.05) bestWithout = Math.max(bestWithout, win(m3, { name: "", energy: E, weights: { "c1:k1": w, "c1:k2": 1 - w }, routes: [] }));
    expect(win(m3, m3.rival) - bestWithout).toBeGreaterThan(0.04);
  });
});

describe("balance checks, missions 4 to 8", () => {
  const seq = (order: string[]): Design => ({
    name: "strict",
    energy: m4.rival.energy,
    weights: { [order[0]]: 1 },
    routes: order.slice(0, -1).map((k, i) => ({ from: k, to: order[i + 1], share: 1 })),
  });

  it("mission 4: a strict sequence that starts on the immune class almost never wins; the rival's robust design wins whichever class is immune", () => {
    for (const sc of variantScenarios(m4)) {
      const immune = Object.keys(sc.trueEffect).find((k) => sc.trueEffect[k] === 0)!;
      const rest = ["c1:k1", "c1:k2", "c1:k3"].filter((k) => k !== immune);
      expect(win(m4, seq([immune, ...rest]), 2000, 1989, sc)).toBeLessThan(0.05);
      expect(win(m4, m4.rival, 4000, 1989, sc)).toBeGreaterThan(0.86);
    }
  });

  it("mission 4: the strict sequence intelligence suggests (Recon first) wins when Recon works and fails when it is immune", () => {
    const [a, b] = variantScenarios(m4);
    const recon = seq(["c1:k2", "c1:k1", "c1:k3"]);
    const results = [a, b].map((sc) => ({ immune: sc.trueEffect["c1:k2"] === 0, w: win(m4, recon, 2000, 1989, sc) }));
    expect(results.find((r) => r.immune)!.w).toBeLessThan(0.05);
    expect(results.find((r) => !r.immune)!.w).toBeGreaterThan(0.6);
  });

  it("mission 5: Ground Control deserves more energy than either cannon", () => {
    const total = energyUsed(m5.scenario, m5.rival);
    const third = Math.floor(total / 3 / 5) * 5;
    const level: Design = { ...m5.rival, energy: { c1: third, c2: third, [GC]: total - 2 * third } };
    const starved: Design = { ...m5.rival, energy: { c1: 200, c2: 200, [GC]: total - 400 } };
    // the gain over a level split is modest but steady (about two points); starving Ground Control is costly
    const avg = (d: Design) => variantScenarios(m5).reduce((s, sc) => s + win(m5, d, 6000, 7, sc), 0) / variantScenarios(m5).length;
    expect(avg(m5.rival)).toBeGreaterThan(avg(level) + 0.01);
    expect(avg(m5.rival)).toBeGreaterThan(avg(starved) + 0.1);
  });

  it("mission 6: five formations make it a gamble; even the rival, which stops well above both goals on average, loses about one battle in ten", () => {
    for (const sc of variantScenarios(m6)) {
      const r = res(sc, m6.rival);
      r.classStop.forEach((x, k) => expect(x).toBeGreaterThan(sc.classes[k].goal + 0.1));
      expect(r.allPrimary).toBeLessThan(0.95);
    }
  });

  it("mission 7: start where the battle is decided, end where the points are", () => {
    const attackOnly: Design = { ...m7.rival, routes: [] };
    for (const sc of variantScenarios(m7)) {
      const r = res(sc, m7.rival);
      const a = res(sc, attackOnly);
      expect(r.allPrimary).toBeGreaterThan(win(m7, equalSplit(m7, m7.rival.energy), 4000, 1989, sc) + 0.2);
      // the wormholes cost nothing on the primary goal and earn the secondary goals
      expect(Math.abs(r.allPrimary - a.allPrimary)).toBeLessThan(0.01);
      expect(r.goalMet[1] + r.goalMet[2]).toBeGreaterThan(0.8);
      expect(a.goalMet[1] + a.goalMet[2]).toBe(0);
    }
  });

  it("mission 8: the rival meets both primary goals in about nine battles in ten, and an even spread of drones does far worse", () => {
    for (const sc of variantScenarios(m8)) {
      const r = res(sc, m8.rival);
      expect(r.goalMet[0]).toBeGreaterThan(0.88);
      expect(r.goalMet[1]).toBeGreaterThan(0.88);
      expect(r.allPrimary - win(m8, equalSplit(m8, m8.rival.energy), 4000, 1989, sc)).toBeGreaterThan(0.15);
    }
  });
});

describe("carrying designs between missions", () => {
  const all = missions();
  const rec = (m: Mission, design: Design) => ({ missionId: m.id, scenario: m.scenario, design, seed: 1, launchedAt: 0, won: true, tally: [], energyUsed: energyUsed(m.scenario, design) });

  it("carry-over only names earlier missions with the same targets", () => {
    for (const m of all) {
      if (!m.carryOver) continue;
      const from = all.find((x) => x.id === m.carryOver);
      expect(from, m.id).toBeDefined();
      expect(from!.number).toBeLessThan(m.number);
      expect(sameTargets(from!.scenario, m.scenario), m.id).toBe(true);
    }
  });

  it("mission 3 starts from mission 2's design, and both it and the kept copy fit mission 3", () => {
    const [m1, m2, m3] = all;
    const d2: Design = { ...m2.rival, name: "My plan" };
    const { design, saved } = startingDesigns(m3, [rec(m1, m1.rival), rec(m2, d2)]);
    expect(saved).toHaveLength(1);
    expect(saved[0].name).toContain("Mission 2");
    expect(design.name).not.toBe(saved[0].name);
    for (const d of [design, saved[0]]) {
      expect(validateDesign(m3.scenario, d).filter((i) => i.level === "error")).toEqual([]);
      expect(energyUsed(m3.scenario, d)).toBeLessThanOrEqual(m3.scenario.energyAvailable);
    }
    expect(design.weights).toEqual(d2.weights);
  });

  it("missions without carry-over start fresh", () => {
    const [m1, m2] = all;
    expect(startingDesigns(m2, [rec(m1, m1.rival)])).toEqual({ design: m2.start, saved: [] });
  });
});
