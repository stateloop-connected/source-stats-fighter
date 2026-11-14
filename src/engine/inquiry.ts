/**
 * The board of inquiry. After every campaign battle it compares how often the commander's design
 * would have won under the true effects with the rival's reference design, gives a verdict, and
 * adjusts merit and rank. Pure functions: the odds are computed elsewhere and passed in.
 */

export interface Rank {
  name: string;
  /** Picture slot of the insignia. */
  insignia: string;
  /** Merit needed to be promoted to this rank. */
  merit: number;
}

/** Placeholder names. A run that goes well ends one or two ranks short of the top. */
export const RANKS: Rank[] = [
  { name: "Ensign", insignia: "rank-1", merit: 0 },
  { name: "Lieutenant", insignia: "rank-2", merit: 3 },
  { name: "Lieutenant Commander", insignia: "rank-3", merit: 8 },
  { name: "Commander", insignia: "rank-4", merit: 16 },
  { name: "Captain", insignia: "rank-5", merit: 26 },
  { name: "Admiral", insignia: "rank-6", merit: 38 },
];

/** A rank is lost only when merit falls this far below what the rank needed. */
export const DEMOTION_MARGIN = 2;
/** Merit never falls below this, so one bad run of luck does not bury a career. */
export const MERIT_FLOOR = -4;

export type Verdict = "commendation" | "credited" | "lucky" | "noBlame" | "reprimand";

export interface MeritItem {
  reason: string;
  points: number;
}

export interface Standing {
  merit: number;
  rank: number;
}

export interface Inquiry {
  /** Share of battles this design wins under the true effects. */
  odds: number;
  /** The same for the rival's reference design. */
  rivalOdds: number;
  verdict: Verdict;
  items: MeritItem[];
  before: Standing;
  after: Standing;
}

export interface InquiryInput {
  won: boolean;
  odds: number;
  rivalOdds: number;
  /** Mission weight: merit points are multiplied by it. */
  stakes: number;
  /** Names of secondary goals that were met. */
  secondaryMet: string[];
  energyUsed: number;
  energyAvailable: number;
}

/** How close to the rival counts as "at least as good". */
export const RIVAL_TOLERANCE = 0.03;

export function verdictOf(won: boolean, odds: number, rivalOdds: number): Verdict {
  if (won) {
    if (odds >= rivalOdds - RIVAL_TOLERANCE) return "commendation";
    if (odds >= 0.5) return "credited";
    return "lucky";
  }
  // sound: a design that would usually have won, or nearly as often as the rival's
  const sound = odds >= Math.min(0.75, rivalOdds - 0.1);
  return sound ? "noBlame" : "reprimand";
}

export const VERDICT_TEXT: Record<Verdict, { title: string; text: string }> = {
  commendation: { title: "Commendation", text: "The board finds the plan as sound as any Command could have drawn up. Commended, with merit towards promotion." },
  credited: { title: "Mission credited", text: "The plan was fair and the battle was won. The board credits the mission without comment." },
  lucky: { title: "Credited, with a remark", text: "The battle was won, but the plan would have lost more often than not. The board notes that luck is not a strategy. No merit is awarded." },
  noBlame: { title: "No blame", text: "The plan was sound. Hard battles are sometimes lost, and the board attaches no blame." },
  reprimand: { title: "Reprimand", text: "A sound plan was available and this was not it. The board records a loss of merit." },
};

export function judge(inp: InquiryInput, before: Standing): Inquiry {
  const verdict = verdictOf(inp.won, inp.odds, inp.rivalOdds);
  const s = inp.stakes;
  const items: MeritItem[] = [];
  if (verdict === "commendation") items.push({ reason: "Commendation", points: 2 * s });
  if (verdict === "credited") items.push({ reason: "Mission credited", points: s });
  if (verdict === "reprimand") items.push({ reason: "Reprimand", points: -2 * s });
  // extras count only when the primary goals were met, and not for a lucky win
  if (inp.won && verdict !== "lucky") {
    for (const name of inp.secondaryMet) items.push({ reason: `Secondary goal met: ${name}`, points: s });
    if (inp.energyUsed <= 0.9 * inp.energyAvailable) items.push({ reason: "At least a tenth of the energy returned", points: 1 });
  }
  const merit = Math.max(MERIT_FLOOR, before.merit + items.reduce((a, x) => a + x.points, 0));
  return { odds: inp.odds, rivalOdds: inp.rivalOdds, verdict, items, before, after: { merit, rank: rankFor(before.rank, merit) } };
}

/** Promotion as soon as merit reaches the next rank; demotion (one step) only well below the current one. */
export function rankFor(current: number, merit: number): number {
  let r = current;
  while (r + 1 < RANKS.length && merit >= RANKS[r + 1].merit) r++;
  if (r === current && r > 0 && merit < RANKS[r].merit - DEMOTION_MARGIN) r--;
  return r;
}

export const START: Standing = { merit: 0, rank: 0 };
