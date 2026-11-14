import { describe, expect, it } from "vitest";
import { judge, rankFor, RANKS, START, verdictOf, type InquiryInput, type Standing } from "./inquiry";
import { missions } from "./missions";

const base: InquiryInput = { won: true, odds: 0.9, rivalOdds: 0.9, stakes: 1, secondaryMet: [], energyUsed: 300, energyAvailable: 300 };

describe("board of inquiry", () => {
  it("gives the verdicts of the plan's table", () => {
    expect(verdictOf(true, 0.92, 0.9)).toBe("commendation");
    expect(verdictOf(true, 0.88, 0.9)).toBe("commendation");
    expect(verdictOf(true, 0.7, 0.9)).toBe("credited");
    expect(verdictOf(true, 0.4, 0.9)).toBe("lucky");
    expect(verdictOf(false, 0.85, 0.9)).toBe("noBlame");
    expect(verdictOf(false, 0.5, 0.9)).toBe("reprimand");
  });

  it("weighs merit by the mission's stakes", () => {
    expect(judge({ ...base, stakes: 2 }, START).after.merit).toBe(4);
    expect(judge({ ...base, odds: 0.7, stakes: 3 }, START).after.merit).toBe(3);
    expect(judge({ ...base, won: false, odds: 0.3, stakes: 2 }, { merit: 10, rank: 2 }).after.merit).toBe(6);
  });

  it("pays for secondary goals and unspent energy only when the battle was won on a plan that deserved it", () => {
    const extras = { secondaryMet: ["Recon", "Supply"], energyUsed: 250 };
    expect(judge({ ...base, ...extras, stakes: 2 }, START).after.merit).toBe(4 + 2 + 2 + 1);
    expect(judge({ ...base, ...extras, odds: 0.3 }, START).after.merit).toBe(0);
    expect(judge({ ...base, ...extras, won: false }, START).after.merit).toBe(0);
  });

  it("promotes as soon as merit is reached, demotes only well below the rank, one step at a time", () => {
    expect(rankFor(0, 3)).toBe(1);
    expect(rankFor(0, 16)).toBe(3);
    expect(rankFor(3, 15)).toBe(3);
    expect(rankFor(3, RANKS[3].merit - 3)).toBe(2);
    expect(rankFor(0, -4)).toBe(0);
    const s: Standing = { merit: 9, rank: 2 };
    const q = judge({ ...base, won: false, odds: 0.2, stakes: 3 }, s);
    expect(q.after).toEqual({ merit: 3, rank: 1 });
  });

  it("a run that goes well ends one or two ranks short of the top; only a near-perfect run reaches it", () => {
    const run = (verdictOdds: number, extras: boolean) => {
      let st = START;
      for (const m of missions()) {
        const secondaries = extras ? m.scenario.classes.filter((k) => !k.primary).map((k) => k.name) : [];
        st = judge({ ...base, odds: verdictOdds, stakes: m.stakes, secondaryMet: secondaries, energyUsed: extras ? 270 : 300 }, st).after;
      }
      return st.rank;
    };
    const top = RANKS.length - 1;
    expect(run(0.9, false)).toBe(top - 1); // commended every time, nothing extra
    expect(run(0.7, false)).toBeLessThanOrEqual(top - 2); // credited every time
    expect(run(0.9, true)).toBe(top); // commended, every secondary goal, energy to spare
  });
});
