import { GC, type Design, type Scenario } from "./model";

/**
 * Version of saved state and exported files.
 * 1: MVP. 2: lanes (each cannon faces its own ships), optional edge label positions on routes.
 * 3: campaign. Saved state gains the campaign run and a second workspace; exported files are unchanged.
 */
export const DATA_VERSION = 3;

const isObj = (x: unknown): x is Record<string, any> => !!x && typeof x === "object" && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const isStr = (x: unknown): x is string => typeof x === "string";

export class DataError extends Error {}

function need(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new DataError(msg);
}

/** Check a scenario read from storage or a file. Throws a DataError with a plain message. */
export function checkScenario(s: unknown): Scenario {
  need(isObj(s), "The scenario is missing.");
  need(Array.isArray(s.cannons) && s.cannons.length >= 1, "The scenario has no cannons.");
  need(Array.isArray(s.classes) && s.classes.length >= 1, "The scenario has no ship classes.");
  const ids = new Set<string>();
  for (const c of s.cannons) {
    need(isObj(c) && isStr(c.id) && isStr(c.name), "A cannon in the scenario is incomplete.");
    need(!ids.has(c.id) && c.id !== GC, `Cannon id “${c.id}” is used twice.`);
    ids.add(c.id);
    if (!isStr(c.weapon)) c.weapon = "beam";
  }
  for (const k of s.classes) {
    need(isObj(k) && isStr(k.id) && isStr(k.name), "A ship class in the scenario is incomplete.");
    need(!ids.has(k.id), `Ship class id “${k.id}” is used twice.`);
    ids.add(k.id);
    need(isNum(k.goal) && k.goal >= 0 && k.goal <= 1, `The goal for ${k.name} must be between 0 and 100%.`);
    k.primary = !!k.primary;
  }
  need(isObj(s.trueEffect) && isObj(s.intel), "The scenario has no effectiveness table.");
  for (const v of Object.values(s.trueEffect)) need(isNum(v), "An effectiveness value is not a number.");
  for (const v of Object.values(s.intel)) need(isObj(v) && isNum(v.guess) && isNum(v.low) && isNum(v.high), "An intelligence entry is incomplete.");
  if (!isObj(s.classCorrelation)) s.classCorrelation = {};
  for (const v of Object.values(s.classCorrelation)) need(isNum(v) && Math.abs(v) < 1, "A correlation between ship classes is not between −1 and 1.");
  need(isNum(s.formations) && s.formations >= 1, "The number of formations must be at least 1.");
  need(isNum(s.alpha) && s.alpha > 0 && s.alpha < 0.5, "The swarm size must be between 0 and 50%.");
  need(isNum(s.energyAvailable) && s.energyAvailable >= 0, "Available energy must be a number.");
  if (!isStr(s.name)) s.name = "Imported scenario";
  s.hideTruth = s.hideTruth !== false;
  return s as unknown as Scenario;
}

/** Check and upgrade a design read from storage or a file. */
export function checkDesign(d: unknown): Design {
  need(isObj(d), "The design is missing.");
  need(isObj(d.energy) && isObj(d.weights) && Array.isArray(d.routes), "The design is incomplete.");
  for (const v of Object.values(d.energy)) need(isNum(v) && v >= 0, "An energy value is not a non-negative number.");
  for (const v of Object.values(d.weights)) need(isNum(v) && v >= 0 && v <= 1 + 1e-9, "A drone share is not between 0 and 100%.");
  for (const r of d.routes) {
    need(isObj(r) && isStr(r.from) && isStr(r.to) && isNum(r.share), "A wormhole in the design is incomplete.");
    if (r.label !== undefined && !(isObj(r.label) && isNum(r.label.x) && isNum(r.label.y))) delete r.label;
  }
  if (!isStr(d.name)) d.name = "Imported design";
  return d as unknown as Design;
}

/** Upgrade data written by an earlier version. Returns notes for the player about what changed. */
export function upgrade(version: unknown): string[] {
  const v = isNum(version) ? version : 1;
  const notes: string[] = [];
  if (v > DATA_VERSION) throw new DataError("This file was written by a newer version of Alpha Wars ’89.");
  if (v < 2) notes.push("Saved with version 0.1: goals now count ships in every cannon's lane, so earlier simulation results were discarded.");
  return notes;
}
