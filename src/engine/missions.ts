import { GC, targetKey, type Assumption, type Design, type Scenario } from "./model";

/* ---------- Characters (drafts; names and voices can be replaced freely) ---------- */

export type Speaker = "commander" | "scientist" | "intel" | "rival";

export const CHARACTERS: Record<Speaker, { name: string; role: string; portrait: string }> = {
  commander: { name: "Commodore Ilse Brandt", role: "Commanding officer", portrait: "portrait-commander" },
  scientist: { name: "Dr. Ozzie Pell", role: "Chief scientist", portrait: "portrait-scientist" },
  intel: { name: "Major Corvin Slate", role: "Intelligence officer", portrait: "portrait-intel" },
  rival: { name: "Commander Rex Hollister", role: "Rival commander", portrait: "portrait-rival" },
};

/* ---------- Mission format ---------- */

export type PresetId = "equal" | "strict" | "holm";

/** Which parts of Setup and Simulation a mission opens. Free training opens everything. */
export interface MissionRules {
  /** Can the commander open wormholes? */
  wormholes: boolean;
  /** Presets offered in Setup. */
  presets: PresetId[];
  /** R and TikZ exports of the design (JSON export and import are never offered in a campaign). */
  exports: boolean;
  /** Assumptions the training simulator may use. */
  simulator: Assumption[];
}

export const FREE_RULES: MissionRules & { scenarioEditor: true; json: true } = {
  wormholes: true,
  presets: ["equal", "strict", "holm"],
  exports: true,
  simulator: ["intel", "intelLow", "truth", "custom"],
  scenarioEditor: true,
  json: true,
};

/** Places in Setup and Simulation where a hint can sit. */
export type HintAnchor = "briefing" | "energy" | "network" | "presets" | "simulator" | "battle";

export interface Hint {
  id: string;
  anchor: HintAnchor;
  text: string;
}

export interface Mission {
  id: string;
  number: number;
  title: string;
  scenario: Scenario;
  rules: MissionRules;
  /** The commanding officer's lines in the briefing, one paragraph each. */
  briefing: string[];
  /** At most three, from the chief scientist. */
  hints: Hint[];
  /** The design the commander starts from when nothing is carried over. */
  start: Design;
  /**
   * Id of an earlier mission whose launched design is carried into this one: the commander starts
   * from it (fitted to this mission's rules and energy) and a copy is kept under Designs for
   * comparison. Only for missions with the same targets. Missing means a fresh start.
   */
  carryOver?: string;
  /** The reference design, attributed to the rival commander. */
  rival: Design;
  /** Picture slot shown with the briefing. */
  art: string;
}

const T = targetKey;

function scenario(p: Omit<Scenario, "classCorrelation" | "alpha" | "hideTruth"> & Partial<Pick<Scenario, "classCorrelation" | "alpha" | "hideTruth">>): Scenario {
  return { alpha: 0.025, hideTruth: false, classCorrelation: {}, ...p };
}

/* ---------- Mission 1: First Light ---------- */

function m1(): Mission {
  const sc = scenario({
    name: "Mission 1: First Light",
    cannons: [{ id: "c1", name: "Plasma Lance", weapon: "plasma" }],
    classes: [{ id: "k1", name: "Attack", goal: 0.7, primary: true }],
    trueEffect: { [T("c1", "k1")]: 0.35 },
    intel: { [T("c1", "k1")]: { guess: 0.35, low: 0.35, high: 0.35 } },
    formations: 10,
    energyAvailable: 300,
  });
  return {
    id: "m1",
    number: 1,
    title: "First Light",
    scenario: sc,
    rules: { wormholes: false, presets: [], exports: false, simulator: ["truth"] },
    briefing: [
      "Commander. A scout wing is inbound: ten formations of Attack ships, nothing else. You have one cannon, the Plasma Lance, and Ground Control to track for it.",
      "This is a clean first assignment. The Lance has been tested on the range, so its effectiveness is not in doubt. The swarm is already on the only target. Your job is the energy.",
      "Stop seven ships in ten. Use what you need, and return what you do not. The board notices both.",
    ],
    hints: [
      { id: "m1-energy", anchor: "energy", text: "The cannon's reading is compared with Ground Control's tracking. Starve either one and the impact suffers. Try them level first." },
      { id: "m1-network", anchor: "network", text: "One target, one swarm. The shield shown here is what the impact has to beat. More energy does not lower the shield, it raises the impact." },
      { id: "m1-sim", anchor: "simulator", text: "The simulator runs the true effect, so it does not lie to you here. Try a few energy splits and watch how often the goal is met." },
    ],
    start: { name: "First design", energy: { c1: 0, [GC]: 0 }, weights: { [T("c1", "k1")]: 1 }, routes: [] },
    rival: { name: "Hollister’s plan", energy: { c1: 135, [GC]: 135 }, weights: { [T("c1", "k1")]: 1 }, routes: [] },
    art: "mission-1",
  };
}

/* ---------- Missions 2 and 3: Two Fronts, Wormhole Protocol ---------- */

function twoFrontsScenario(name: string, energy: number): Scenario {
  return scenario({
    name,
    cannons: [{ id: "c1", name: "Plasma Lance", weapon: "plasma" }],
    classes: [
      { id: "k1", name: "Attack", goal: 0.6, primary: true },
      { id: "k2", name: "Supply", goal: 0.6, primary: true },
    ],
    trueEffect: { [T("c1", "k1")]: 0.4, [T("c1", "k2")]: 0.3 },
    intel: { [T("c1", "k1")]: { guess: 0.4, low: 0.4, high: 0.4 }, [T("c1", "k2")]: { guess: 0.3, low: 0.3, high: 0.3 } },
    classCorrelation: { "k1|k2": 0.3 },
    formations: 12,
    energyAvailable: energy,
  });
}

function m2(): Mission {
  return {
    id: "m2",
    number: 2,
    title: "Two Fronts",
    scenario: twoFrontsScenario("Mission 2: Two Fronts", 380),
    rules: { wormholes: false, presets: ["equal"], exports: false, simulator: ["truth"] },
    briefing: [
      "Good work on the scouts. The enemy has answered with two kinds of ship in every formation: Attack ships and Supply ships.",
      "Both matter. Command wants six in ten of each stopped, and losing either goal loses the battle. The Lance is strong against Attack ships and only fair against Supply ships.",
      "You still have one swarm. How you divide it is your decision.",
    ],
    hints: [
      { id: "m2-network", anchor: "network", text: "Split the swarm and both shields go up. The question is not whether to split, but how. Put drones where they are needed, not where they are easy." },
      { id: "m2-presets", anchor: "presets", text: "Equal split is a starting point, not an answer. The Lance hits Attack ships hard. Which target needs the help?" },
      { id: "m2-sim", anchor: "simulator", text: "Watch both goal bars. A design that wins one goal every time and loses the other half the time loses half its battles." },
    ],
    start: { name: "First design", energy: { c1: 0, [GC]: 0 }, weights: { [T("c1", "k1")]: 0.5, [T("c1", "k2")]: 0.5 }, routes: [] },
    rival: { name: "Hollister’s plan", energy: { c1: 185, [GC]: 185 }, weights: { [T("c1", "k1")]: 0.2, [T("c1", "k2")]: 0.8 }, routes: [] },
    art: "mission-2",
  };
}

function m3(): Mission {
  return {
    id: "m3",
    number: 3,
    title: "Wormhole Protocol",
    scenario: twoFrontsScenario("Mission 3: Wormhole Protocol", 340),
    rules: { wormholes: true, presets: ["equal", "strict", "holm"], exports: true, simulator: ["truth"] },
    carryOver: "m2",
    briefing: [
      "The same enemy, the same Lance, and less energy. The reactor took damage in the last engagement.",
      "Dr. Pell's people have cleared the wormhole protocol for field use. Drones on a ship that has fallen are no longer wasted: they can be sent on to the next target.",
      "Six in ten of each class, as before. Do more with less, Commander.",
    ],
    hints: [
      { id: "m3-network", anchor: "network", text: "Drag from one target to another to open a wormhole. When the first ship falls, its drones fly through and weaken the second shield. Two-way wormholes work too." },
      { id: "m3-presets", anchor: "presets", text: "Holm sends every target's drones to all the others. Strict sequence puts everything on one target first. Both are honest ways to start; neither is tuned to this battle." },
      { id: "m3-sim", anchor: "simulator", text: "Your design from the last mission is kept under Designs. Compare it in the simulator with a wormhole design on this energy. The difference is what the protocol buys you." },
    ],
    start: { name: "First design", energy: { c1: 0, [GC]: 0 }, weights: { [T("c1", "k1")]: 0.5, [T("c1", "k2")]: 0.5 }, routes: [] },
    rival: {
      name: "Hollister’s plan",
      energy: { c1: 170, [GC]: 170 },
      weights: { [T("c1", "k1")]: 0.3, [T("c1", "k2")]: 0.7 },
      routes: [
        { from: T("c1", "k1"), to: T("c1", "k2"), share: 1 },
        { from: T("c1", "k2"), to: T("c1", "k1"), share: 1 },
      ],
    },
    art: "mission-3",
  };
}

/** The missions of a campaign run, in order. Built fresh on each call so callers may mutate them. */
export function missions(): Mission[] {
  return [m1(), m2(), m3()];
}

export function missionById(id: string): Mission | undefined {
  return missions().find((m) => m.id === id);
}
