import { targets, energyUsed, type Design, type Scenario } from "./model";
import { missions, type Mission } from "./missions";
import { checkDesign, checkScenario } from "./migrate";

/** One battle fought in a campaign run. The outcome follows from scenario, design and seed. */
export interface BattleRecord {
  missionId: string;
  scenario: Scenario;
  design: Design;
  seed: number;
  launchedAt: number;
  won: boolean;
  tally: number[];
  energyUsed: number;
}

export type Phase = "briefing" | "planning" | "launched";

export interface Campaign {
  id: string;
  startedAt: number;
  /** Index of the current mission; equal to the number of missions when the run is over. */
  index: number;
  phase: Phase;
  record: BattleRecord[];
  hintsDismissed: string[];
}

export function newCampaign(now = Date.now()): Campaign {
  return { id: `run${now.toString(36)}`, startedAt: now, index: 0, phase: "briefing", record: [], hintsDismissed: [] };
}

export function currentMission(c: Campaign): Mission | null {
  return missions()[c.index] ?? null;
}

export function isOver(c: Campaign): boolean {
  return c.index >= missions().length;
}

/** The record of the current mission's battle, once launched. */
export function currentRecord(c: Campaign): BattleRecord | null {
  const m = currentMission(c);
  return m ? (c.record.find((r) => r.missionId === m.id) ?? null) : null;
}

export const sameTargets = (a: Scenario, b: Scenario) => JSON.stringify(targets(a).map((t) => t.key)) === JSON.stringify(targets(b).map((t) => t.key));

/** A design fitted to a mission: wormholes removed where closed, energy scaled into the budget (steps of 5). */
export function fitDesign(m: Mission, d: Design): { design: Design; rescaled: boolean } {
  const out: Design = JSON.parse(JSON.stringify(d));
  if (!m.rules.wormholes) out.routes = [];
  const used = energyUsed(m.scenario, out);
  if (used <= m.scenario.energyAvailable) return { design: out, rescaled: false };
  const f = m.scenario.energyAvailable / used;
  for (const k of Object.keys(out.energy)) out.energy[k] = Math.floor((out.energy[k] * f) / 5) * 5;
  return { design: out, rescaled: true };
}

/**
 * The designs a mission starts with. When the mission names a mission to carry over from and that
 * battle was fought, the commander starts from its design fitted to the new mission, and a copy of
 * it stays under Designs, labelled with where it came from. Otherwise the mission's own start design.
 */
export function startingDesigns(m: Mission, record: BattleRecord[]): { design: Design; saved: Design[] } {
  const start: Design = JSON.parse(JSON.stringify(m.start));
  const from = m.carryOver ? record.find((r) => r.missionId === m.carryOver) : undefined;
  if (!from || !sameTargets(from.scenario, m.scenario)) return { design: start, saved: [] };
  const n = missions().find((x) => x.id === from.missionId)?.number ?? "?";
  const { design, rescaled } = fitDesign(m, from.design);
  const kept: Design = { ...JSON.parse(JSON.stringify(design)), name: `Mission ${n} plan${rescaled ? " (energy scaled)" : ""}` };
  return { design: { ...design, name: `Mission ${m.number} plan` }, saved: [kept] };
}

const isObj = (x: unknown): x is Record<string, any> => !!x && typeof x === "object" && !Array.isArray(x);

/** Check a campaign read from storage. Throws on anything it cannot use. */
export function checkCampaign(c: unknown): Campaign {
  if (!isObj(c)) throw new Error("The campaign is missing.");
  const index = Number(c.index);
  if (!Number.isInteger(index) || index < 0) throw new Error("The campaign's mission number is invalid.");
  const phase: Phase = c.phase === "planning" || c.phase === "launched" ? c.phase : "briefing";
  const record: BattleRecord[] = Array.isArray(c.record)
    ? c.record.map((r: any) => ({
        missionId: String(r.missionId),
        scenario: checkScenario(r.scenario),
        design: checkDesign(r.design),
        seed: Number(r.seed) >>> 0,
        launchedAt: Number(r.launchedAt) || 0,
        won: !!r.won,
        tally: Array.isArray(r.tally) ? r.tally.map(Number) : [],
        energyUsed: Number(r.energyUsed) || 0,
      }))
    : [];
  return {
    id: String(c.id ?? "run"),
    startedAt: Number(c.startedAt) || 0,
    index: Math.min(index, missions().length),
    phase,
    record,
    hintsDismissed: Array.isArray(c.hintsDismissed) ? c.hintsDismissed.map(String) : [],
  };
}
