import { GC, targetKey, type Assumption, type Design, type Scenario } from "./model";

/* ---------- Characters (drafts; names and voices can be replaced freely) ---------- */

export type Speaker = "commander" | "scientist" | "intel" | "rival";

export const CHARACTERS: Record<Speaker, { name: string; role: string; portrait: string }> = {
  commander: { name: "Commodore Ilse Brandt", role: "Commanding officer", portrait: "portrait-commander" },
  scientist: { name: "Dr. Ozzie Pell", role: "Chief scientist", portrait: "portrait-scientist" },
  intel: { name: "Major Vera Slate", role: "Intelligence officer", portrait: "portrait-intel" },
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
  /** Simulated battles granted for the mission (missing: unlimited). */
  simAllowance?: number;
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
  /** The intelligence officer's report in the briefing, one paragraph each (missing: none). */
  intelReport?: string[];
  /** How much the board's verdict weighs: merit points are multiplied by this. */
  stakes: number;
  /**
   * Variation between runs: alternative true effects within what intelligence states. Each run plays
   * one of them, chosen when the mission starts; the scenario's own true effects are the first.
   */
  variants?: Record<string, number>[];
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
    stakes: 1,
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
    stakes: 1,
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
    stakes: 1,
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

/* ---------- From mission 4 on: classified truth, intelligence only, no hints ---------- */

const INTEL_SIM: Assumption[] = ["intel", "intelLow", "custom"];
const corrAll = (ids: string[], r: number) => {
  const out: Record<string, number> = {};
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) out[`${ids[i]}|${ids[j]}`] = r;
  return out;
};
const iv = (guess: number, low: number, high: number) => ({ guess, low, high });

/* ---------- Mission 4: Bad Intelligence ---------- */

function m4(): Mission {
  const sc = scenario({
    name: "Mission 4: Bad Intelligence",
    cannons: [{ id: "c1", name: "Plasma Lance", weapon: "plasma" }],
    classes: [
      { id: "k1", name: "Attack", goal: 0.6, primary: true },
      { id: "k2", name: "Recon", goal: 0.4, primary: false },
      { id: "k3", name: "Supply", goal: 0.4, primary: false },
    ],
    trueEffect: { [T("c1", "k1")]: 0.38, [T("c1", "k2")]: 0, [T("c1", "k3")]: 0.34 },
    intel: { [T("c1", "k1")]: iv(0.35, 0.25, 0.45), [T("c1", "k2")]: iv(0.45, 0, 0.55), [T("c1", "k3")]: iv(0.3, 0, 0.45) },
    classCorrelation: corrAll(["k1", "k2", "k3"], 0.3),
    formations: 12,
    energyAvailable: 210,
    hideTruth: true,
  });
  return {
    id: "m4",
    number: 4,
    title: "Bad Intelligence",
    stakes: 2,
    scenario: sc,
    variants: [{}, { [T("c1", "k2")]: 0.45, [T("c1", "k3")]: 0 }],
    rules: { wormholes: true, presets: ["equal", "strict", "holm"], exports: true, simulator: INTEL_SIM },
    briefing: [
      "Three classes this time: Attack, Recon and Supply. Only the Attack ships decide the battle. The other two are worth stopping, and the board will note it if you do.",
      "From today the range reports are classified. You plan on intelligence, and intelligence is not always right.",
    ],
    intelReport: [
      "Our best reading puts the Lance strongest against Recon. I would not stake my pension on it. One of the support classes may carry new hull plating, and if it does, the Lance will not touch it.",
      "We do not know which one. Neither does Command.",
    ],
    hints: [],
    start: { name: "First design", energy: { c1: 0, [GC]: 0 }, weights: { [T("c1", "k1")]: 1 / 3, [T("c1", "k2")]: 1 / 3, [T("c1", "k3")]: 1 / 3 }, routes: [] },
    rival: {
      name: "Hollister’s plan",
      energy: { c1: 105, [GC]: 105 },
      weights: { [T("c1", "k1")]: 1 },
      routes: [
        { from: T("c1", "k1"), to: T("c1", "k2"), share: 0.5 },
        { from: T("c1", "k1"), to: T("c1", "k3"), share: 0.5 },
        { from: T("c1", "k2"), to: T("c1", "k3"), share: 1 },
        { from: T("c1", "k3"), to: T("c1", "k2"), share: 1 },
      ],
    },
    art: "mission-4",
  };
}

/* ---------- Mission 5: Shared Command ---------- */

function m5(): Mission {
  const sc = scenario({
    name: "Mission 5: Shared Command",
    cannons: [
      { id: "c1", name: "Plasma Lance", weapon: "plasma" },
      { id: "c2", name: "Ion Disruptor", weapon: "ion" },
    ],
    classes: [
      { id: "k1", name: "Attack", goal: 0.6, primary: true },
      { id: "k2", name: "Supply", goal: 0.5, primary: true },
    ],
    trueEffect: { [T("c1", "k1")]: 0.4, [T("c1", "k2")]: 0.26, [T("c2", "k1")]: 0.24, [T("c2", "k2")]: 0.4 },
    intel: {
      [T("c1", "k1")]: iv(0.4, 0.3, 0.5),
      [T("c1", "k2")]: iv(0.25, 0.15, 0.35),
      [T("c2", "k1")]: iv(0.25, 0.15, 0.35),
      [T("c2", "k2")]: iv(0.4, 0.3, 0.5),
    },
    classCorrelation: { "k1|k2": 0.3 },
    formations: 10,
    energyAvailable: 535,
    hideTruth: true,
  });
  return {
    id: "m5",
    number: 5,
    title: "Shared Command",
    stakes: 2,
    scenario: sc,
    variants: [
      {},
      { [T("c1", "k1")]: 0.42, [T("c1", "k2")]: 0.23, [T("c2", "k1")]: 0.25, [T("c2", "k2")]: 0.37 },
      { [T("c1", "k1")]: 0.39, [T("c1", "k2")]: 0.28, [T("c2", "k1")]: 0.23, [T("c2", "k2")]: 0.42 },
    ],
    rules: { wormholes: true, presets: ["equal", "strict", "holm"], exports: true, simulator: INTEL_SIM },
    briefing: [
      "The Ion Disruptor is back from the yards. Two cannons, one Ground Control. Every formation now brings a ship of each class to each cannon.",
      "Ground Control tracks for both. It is one station with one budget, and its mistakes land in both lanes at once. Think about what it is worth to you.",
    ],
    intelReport: ["The Lance is the better weapon against Attack ships, the Disruptor against Supply. The margins are wide, as usual."],
    hints: [],
    start: {
      name: "First design",
      energy: { c1: 0, c2: 0, [GC]: 0 },
      weights: { [T("c1", "k1")]: 0.25, [T("c1", "k2")]: 0.25, [T("c2", "k1")]: 0.25, [T("c2", "k2")]: 0.25 },
      routes: [],
    },
    rival: {
      name: "Hollister’s plan",
      energy: { c1: 155, c2: 155, [GC]: 225 },
      weights: { [T("c1", "k1")]: 0.3, [T("c1", "k2")]: 0.2, [T("c2", "k1")]: 0.2, [T("c2", "k2")]: 0.3 },
      routes: [
        { from: T("c1", "k1"), to: T("c1", "k2"), share: 1 },
        { from: T("c1", "k2"), to: T("c1", "k1"), share: 1 },
        { from: T("c2", "k1"), to: T("c2", "k2"), share: 1 },
        { from: T("c2", "k2"), to: T("c2", "k1"), share: 1 },
      ],
    },
    art: "mission-5",
  };
}

/* ---------- Mission 6: Short Notice ---------- */

function m6(): Mission {
  const sc = scenario({
    name: "Mission 6: Short Notice",
    cannons: [{ id: "c1", name: "Plasma Lance", weapon: "plasma" }],
    classes: [
      { id: "k1", name: "Attack", goal: 0.6, primary: true },
      { id: "k2", name: "Recon", goal: 0.6, primary: true },
    ],
    trueEffect: { [T("c1", "k1")]: 0.45, [T("c1", "k2")]: 0.36 },
    intel: { [T("c1", "k1")]: iv(0.42, 0.32, 0.52), [T("c1", "k2")]: iv(0.38, 0.28, 0.48) },
    classCorrelation: { "k1|k2": 0.3 },
    formations: 5,
    energyAvailable: 220,
    hideTruth: true,
  });
  return {
    id: "m6",
    number: 6,
    title: "Short Notice",
    stakes: 2,
    scenario: sc,
    variants: [{}, { [T("c1", "k1")]: 0.38, [T("c1", "k2")]: 0.42 }],
    rules: { wormholes: true, presets: ["equal", "strict", "holm"], exports: true, simulator: INTEL_SIM, simAllowance: 3000 },
    briefing: [
      "A raiding party, five formations, and it is already past the outer markers. The reactor is half drained from the last engagement.",
      "Five formations are not many. A run of bad luck cannot be made good later in the battle. Plan with a margin.",
      "The simulator crews are on short rations too. Use their time well.",
    ],
    intelReport: ["Attack and Recon ships, roughly matched. The Lance should do a little better against Attack. A little."],
    hints: [],
    start: { name: "First design", energy: { c1: 0, [GC]: 0 }, weights: { [T("c1", "k1")]: 0.5, [T("c1", "k2")]: 0.5 }, routes: [] },
    rival: {
      name: "Hollister’s plan",
      energy: { c1: 110, [GC]: 110 },
      weights: { [T("c1", "k1")]: 0.45, [T("c1", "k2")]: 0.55 },
      routes: [
        { from: T("c1", "k1"), to: T("c1", "k2"), share: 1 },
        { from: T("c1", "k2"), to: T("c1", "k1"), share: 1 },
      ],
    },
    art: "mission-6",
  };
}

/* ---------- Mission 7: Priorities ---------- */

function m7(): Mission {
  const sc = scenario({
    name: "Mission 7: Priorities",
    cannons: [{ id: "c1", name: "Plasma Lance", weapon: "plasma" }],
    classes: [
      { id: "k1", name: "Attack", goal: 0.6, primary: true },
      { id: "k2", name: "Recon", goal: 0.5, primary: false },
      { id: "k3", name: "Supply", goal: 0.5, primary: false },
    ],
    trueEffect: { [T("c1", "k1")]: 0.4, [T("c1", "k2")]: 0.34, [T("c1", "k3")]: 0.3 },
    intel: { [T("c1", "k1")]: iv(0.4, 0.3, 0.5), [T("c1", "k2")]: iv(0.32, 0.22, 0.42), [T("c1", "k3")]: iv(0.32, 0.22, 0.42) },
    classCorrelation: corrAll(["k1", "k2", "k3"], 0.3),
    formations: 12,
    energyAvailable: 200,
    hideTruth: true,
  });
  return {
    id: "m7",
    number: 7,
    title: "Priorities",
    stakes: 2,
    scenario: sc,
    variants: [{}, { [T("c1", "k1")]: 0.39, [T("c1", "k2")]: 0.28, [T("c1", "k3")]: 0.36 }],
    rules: { wormholes: true, presets: ["equal", "strict", "holm"], exports: true, simulator: INTEL_SIM },
    briefing: [
      "The battle is decided by the Attack ships, as always. But Command has a particular interest in the Recon and Supply ships this time, and the board will weigh them heavily.",
      "Win first. Then collect.",
    ],
    intelReport: ["The Lance should handle all three. Attack ships are the easiest. Recon and Supply are a close call."],
    hints: [],
    start: { name: "First design", energy: { c1: 0, [GC]: 0 }, weights: { [T("c1", "k1")]: 1 / 3, [T("c1", "k2")]: 1 / 3, [T("c1", "k3")]: 1 / 3 }, routes: [] },
    rival: {
      name: "Hollister’s plan",
      energy: { c1: 100, [GC]: 100 },
      weights: { [T("c1", "k1")]: 1 },
      routes: [
        { from: T("c1", "k1"), to: T("c1", "k2"), share: 0.5 },
        { from: T("c1", "k1"), to: T("c1", "k3"), share: 0.5 },
        { from: T("c1", "k2"), to: T("c1", "k3"), share: 1 },
        { from: T("c1", "k3"), to: T("c1", "k2"), share: 1 },
      ],
    },
    art: "mission-7",
  };
}

/* ---------- Mission 8: The Armada ---------- */

function m8(): Mission {
  const C = ["c1", "c2", "c3"];
  const K = ["k1", "k2", "k3", "k4"];
  const truth: Record<string, number> = {};
  const intel: Record<string, { guess: number; low: number; high: number }> = {};
  // rows: cannons; columns: Attack, Supply, Recon, Escort
  const tv = [
    [0.42, 0.28, 0.3, 0.2],
    [0.26, 0.42, 0.22, 0.3],
    [0.32, 0.32, 0.36, 0],
  ];
  const ig = [
    [0.4, 0.3, 0.3, 0.25],
    [0.28, 0.4, 0.25, 0.3],
    [0.32, 0.32, 0.32, 0.2],
  ];
  C.forEach((c, i) =>
    K.forEach((k, j) => {
      truth[T(c, k)] = tv[i][j];
      intel[T(c, k)] = iv(ig[i][j], Math.max(0, +(ig[i][j] - 0.15).toFixed(2)), +(ig[i][j] + 0.12).toFixed(2));
    }),
  );
  intel[T("c3", "k4")] = iv(0.2, 0, 0.32);
  intel[T("c1", "k4")] = iv(0.25, 0, 0.35);
  const sc = scenario({
    name: "Mission 8: The Armada",
    cannons: [
      { id: "c1", name: "Plasma Lance", weapon: "plasma" },
      { id: "c2", name: "Ion Disruptor", weapon: "ion" },
      { id: "c3", name: "Graviton Dish", weapon: "graviton" },
    ],
    classes: [
      { id: "k1", name: "Attack", goal: 0.55, primary: true },
      { id: "k2", name: "Supply", goal: 0.5, primary: true },
      { id: "k3", name: "Recon", goal: 0.35, primary: false },
      { id: "k4", name: "Escort", goal: 0.25, primary: false },
    ],
    trueEffect: truth,
    intel,
    classCorrelation: corrAll(K, 0.3),
    formations: 8,
    energyAvailable: 710,
    hideTruth: true,
  });
  const w: Record<string, number> = { [T("c1", "k1")]: 0.3, [T("c2", "k2")]: 0.3, [T("c3", "k1")]: 0.2, [T("c3", "k2")]: 0.2 };
  const routes = [
    // primaries first, then on to the secondaries in the same lane
    ...C.flatMap((c) => [
      { from: T(c, "k1"), to: T(c, "k2"), share: 0.5 },
      { from: T(c, "k1"), to: T(c, "k3"), share: 0.5 },
      { from: T(c, "k2"), to: T(c, "k1"), share: 0.5 },
      { from: T(c, "k2"), to: T(c, "k3"), share: 0.5 },
      { from: T(c, "k3"), to: T(c, "k4"), share: 1 },
      { from: T(c, "k4"), to: T(c, "k3"), share: 1 },
    ]),
  ];
  return {
    id: "m8",
    number: 8,
    title: "The Armada",
    stakes: 3,
    scenario: sc,
    variants: [
      {},
      { [T("c3", "k4")]: 0.24, [T("c1", "k4")]: 0, [T("c1", "k1")]: 0.4, [T("c2", "k2")]: 0.45 },
      { [T("c3", "k4")]: 0.15, [T("c2", "k1")]: 0.3, [T("c3", "k1")]: 0.28, [T("c3", "k3")]: 0.3 },
    ],
    rules: { wormholes: true, presets: ["equal", "strict", "holm"], exports: true, simulator: INTEL_SIM, simAllowance: 4000 },
    briefing: [
      "This is the one we have been preparing for. Four classes, all three cannons, eight formations. Attack and Supply decide it. Recon and Escort are for the record.",
      "Everything you have learned applies. I will not repeat any of it.",
    ],
    intelReport: [
      "The picture is incomplete. The Graviton Dish is untested against Escorts, and one of our weapons may be useless against them. The rest of the table is our best reading, with the usual margins.",
    ],
    hints: [],
    start: { name: "First design", energy: { c1: 0, c2: 0, c3: 0, [GC]: 0 }, weights: Object.fromEntries(C.flatMap((c) => K.map((k) => [T(c, k), 1 / 12]))), routes: [] },
    rival: { name: "Hollister’s plan", energy: { c1: 160, c2: 160, c3: 160, [GC]: 230 }, weights: w, routes },
    art: "mission-8",
  };
}

/** The missions of a campaign run, in order. Built fresh on each call so callers may mutate them. */
export function missions(): Mission[] {
  return [m1(), m2(), m3(), m4(), m5(), m6(), m7(), m8()];
}

export function missionById(id: string): Mission | undefined {
  return missions().find((m) => m.id === id);
}
