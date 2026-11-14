import { describe, expect, it } from "vitest";
import { simulate } from "./battle";
import { compile, effectsFor, energyUsed, GC, targets, validateDesign, type Design } from "./model";
import { checkScenario, checkDesign } from "./migrate";
import { missions, type Mission } from "./missions";
import { sameTargets, startingDesigns } from "./campaign";

/** Share of battles won under the true effects. */
function win(m: Mission, d: Design, battles = 4000, seed = 1989): number {
  return simulate(compile(m.scenario, d, effectsFor(m.scenario, "truth")), battles, seed).allPrimary;
}

const equalSplit = (m: Mission, energy: Record<string, number>): Design => {
  const ks = targets(m.scenario).map((t) => t.key);
  return { name: "equal", energy, weights: Object.fromEntries(ks.map((k) => [k, 1 / ks.length])), routes: [] };
};

const [m1, m2, m3] = missions();

describe("mission data", () => {
  it.each(missions().map((m) => [m.id, m] as const))("%s is well formed", (_, m) => {
    expect(() => checkScenario(JSON.parse(JSON.stringify(m.scenario)))).not.toThrow();
    expect(() => checkDesign(JSON.parse(JSON.stringify(m.rival)))).not.toThrow();
    expect(validateDesign(m.scenario, m.rival).filter((i) => i.level === "error")).toEqual([]);
    expect(energyUsed(m.scenario, m.rival)).toBeLessThanOrEqual(m.scenario.energyAvailable);
    expect(m.hints.length).toBeLessThanOrEqual(3);
    if (!m.rules.wormholes) expect(m.rival.routes).toEqual([]);
    expect(m.number).toBe(missions().findIndex((x) => x.id === m.id) + 1);
  });
});

describe("balance checks", () => {
  it("every mission: the rival's design wins about 90% of the time", () => {
    for (const m of missions()) {
      const w = win(m, m.rival);
      expect(w, m.id).toBeGreaterThan(0.86);
      expect(w, m.id).toBeLessThan(0.96);
    }
  });

  it("every mission with several targets: an equal split without wormholes does clearly worse than the rival", () => {
    for (const m of missions().filter((x) => targets(x.scenario).length > 1)) {
      expect(win(m, m.rival) - win(m, equalSplit(m, m.rival.energy)), m.id).toBeGreaterThan(0.06);
    }
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
