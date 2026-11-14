import { describe, expect, it } from "vitest";
import { timeline, momentAt, totalDuration, HIT_AT, type Seg } from "./timeline";
import { runFormation } from "../engine/battle";
import { compile, defaultDesign, defaultScenario, effectsFor } from "../engine/model";
import { Rng } from "../engine/rng";

/** Times inside every segment: start, hit, and end. */
function samples(segs: Seg[]) {
  const out: { t: number; seg: number }[] = [];
  let acc = 0;
  segs.forEach((s, i) => {
    for (const f of [0.01, HIT_AT + 0.01, 0.99]) out.push({ t: acc + s.dur * f, seg: i });
    acc += s.dur;
  });
  return out;
}

describe("battle timeline", () => {
  const s = defaultScenario();
  const p = compile(s, { ...defaultDesign(), energy: { c1: 110, c2: 0, gc: 110 } }, effectsFor(s, "truth"));
  const formations = (() => {
    const rng = new Rng(31);
    return Array.from({ length: 300 }, () => runFormation(p, rng, true));
  })();

  it("fires once more than targets fall, and never lets a ship fall without a visible shot", () => {
    for (const fr of formations) {
      const segs = timeline(fr);
      expect(segs.filter((x) => x.kind === "fire").length).toBe(fr.steps.length + 1);
      fr.steps.forEach((st, i) => {
        const fi = segs.findIndex((x) => x.kind === "fall" && x.step === i);
        // the fire segment just before the fall shot at this ship and revealed its impact
        const fire = segs.slice(0, fi).map((x, j) => ({ x, j })).filter(({ x }) => x.kind === "fire").pop()!;
        const before = segs.slice(0, fire.j).reduce((a, x) => a + x.dur, 0);
        const mo = momentAt(fr, p.weights, segs, before + fire.x.dur * 0.99);
        expect(mo.firedAt[st.target]).toBe(true);
        expect(mo.revealed[st.target]).toBe(true);
      });
    }
  });

  it("ends with the engine's result", () => {
    for (const fr of formations) {
      const segs = timeline(fr);
      const end = momentAt(fr, p.weights, segs, totalDuration(segs) + 1);
      expect(end.fallen).toEqual(fr.rejected);
      end.weights.forEach((w, i) => expect(w).toBeCloseTo(fr.finalWeights[i], 12));
      expect(end.counted).toBe(true);
    }
  });

  it("fires only at ships with drones, reveals impacts only on those, and skips cannons without energy", () => {
    for (const fr of formations) {
      const segs = timeline(fr);
      for (const { t } of samples(segs)) {
        const mo = momentAt(fr, p.weights, segs, t);
        for (let i = 0; i < p.m; i++) {
          if (i >= 3) {
            // Ion Disruptor has no energy: it never fires
            expect(mo.firedAt[i] || mo.revealed[i]).toBe(false);
          }
          if (mo.firedAt[i]) expect(mo.weights[i]).toBeGreaterThan(0);
          if (mo.fallen[i]) expect(mo.revealed[i]).toBe(true);
        }
        expect(mo.counted).toBe(mo.seg.kind === "resolve" || mo.seg.kind === "pause");
      }
    }
  });
});
