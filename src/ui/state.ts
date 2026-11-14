import { corrKey, defaultDesign, defaultScenario, GC, targetKey, type Assumption, type Design, type Scenario } from "../engine/model";
import type { SimResult } from "../engine/battle";
import { DATA_VERSION, checkDesign, checkScenario, upgrade } from "../engine/migrate";
import { FREE_RULES, missions, type Mission, type MissionRules } from "../engine/missions";
import { checkCampaign, currentMission, fitDesign, newCampaign, startingDesigns, type BattleRecord, type Campaign } from "../engine/campaign";

export interface SavedDesign {
  id: string;
  design: Design;
  savedAt: number;
}

export interface SimSettings {
  assumption: Assumption;
  battles: number;
  seed: number;
  custom: Record<string, number>;
}

/** Everything Setup, Simulation and Battle work on. Free training and the current mission each have one. */
export interface Workspace {
  scenario: Scenario;
  design: Design;
  saved: SavedDesign[];
  sim: SimSettings;
  lastSim: { result: SimResult; label: string } | null;
}

export type Ctx = "free" | "mission";

/** The active workspace sits at the top level; the other one waits in `stash`. */
export interface AppState extends Workspace {
  ctx: Ctx;
  stash: Workspace | null;
  campaign: Campaign | null;
}

const KEY = "alphawars89.state";
const OLD_KEYS = ["alphawars89.state.v1"];

const defaultSim = (): SimSettings => ({ assumption: "intel", battles: 2000, seed: 1989, custom: {} });

function freshWorkspace(): Workspace {
  return { scenario: defaultScenario(), design: defaultDesign(), saved: [], sim: defaultSim(), lastSim: null };
}

function fresh(): AppState {
  return { ...freshWorkspace(), ctx: "free", stash: null, campaign: null };
}

const WS_KEYS = ["scenario", "design", "saved", "sim", "lastSim"] as const;

function takeWorkspace(st: AppState): Workspace {
  return { scenario: st.scenario, design: st.design, saved: st.saved, sim: st.sim, lastSim: st.lastSim };
}

function putWorkspace(st: AppState, ws: Workspace) {
  for (const k of WS_KEYS) (st as unknown as Record<string, unknown>)[k] = ws[k];
}

function checkWorkspace(w: any, sameVersion: boolean): Workspace {
  const f = freshWorkspace();
  return {
    scenario: checkScenario(w.scenario),
    design: checkDesign(w.design),
    saved: Array.isArray(w.saved)
      ? w.saved.flatMap((x: any) => {
          try {
            return [{ id: String(x.id), design: checkDesign(x.design), savedAt: Number(x.savedAt) || 0 }];
          } catch {
            return [];
          }
        })
      : [],
    sim: { ...f.sim, ...(w.sim ?? {}) },
    lastSim: sameVersion ? (w.lastSim ?? null) : null,
  };
}

/** Notes about upgraded saved state, shown once on the Setup screen. */
export const loadNotes: string[] = [];

function load(): AppState {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
    if (raw === null) for (const k of OLD_KEYS) raw ??= localStorage.getItem(k);
  } catch {
    return fresh();
  }
  if (!raw) return fresh();
  try {
    const st = JSON.parse(raw);
    loadNotes.push(...upgrade(st.version));
    const v = st.version ?? 1;
    const out: AppState = { ...checkWorkspace(st, v >= 2), ctx: "free", stash: null, campaign: null };
    try {
      if (st.campaign) out.campaign = checkCampaign(st.campaign);
      if (st.stash) out.stash = checkWorkspace(st.stash, true);
      if (st.ctx === "mission" && out.campaign && out.stash) out.ctx = "mission";
      else if (st.ctx === "mission") {
        // the mission workspace is unusable: fall back to free training
        out.ctx = "free";
        if (out.stash) putWorkspace(out, out.stash);
        out.stash = null;
      }
    } catch (e) {
      loadNotes.push(`The campaign could not be read (${(e as Error).message}) and was discarded.`);
      if (st.ctx === "mission" && st.stash) putWorkspace(out, checkWorkspace(st.stash, true));
      out.ctx = "free";
      out.stash = null;
      out.campaign = null;
    }
    normalize(out);
    refitKept(out);
    return out;
  } catch (e) {
    loadNotes.push(`Saved state could not be read (${(e as Error).message}) and was replaced by the default scenario.`);
    return fresh();
  }
}

export const state: AppState = load();

const listeners = new Set<() => void>();
export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: DATA_VERSION, ...state }));
    for (const k of OLD_KEYS) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

let scheduled = false;
/**
 * Tell the screens that state changed. Deferred to a fresh task so that focus has already moved
 * (after Tab or a click) when panels redraw; panels then restore focus to the same place.
 */
export function notify() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    listeners.forEach((l) => l());
  }, 0);
}

/** Mutate state, save, and notify listeners (unless quiet). */
export function commit(fn: (s: AppState) => void, quiet = false) {
  fn(state);
  normalize(state);
  persist();
  if (!quiet) notify();
}

/** Reset free training (the campaign is kept). */
export function resetAll() {
  const ws = freshWorkspace();
  if (state.ctx === "free") putWorkspace(state, ws);
  else state.stash = ws;
  persist();
  notify();
}

/* ---------------- campaign and free training ---------------- */

const listenersCtx = new Set<() => void>();
/** Called when the active workspace is swapped (screens drop selections, comparisons and battles). */
export function onContextChange(fn: () => void) {
  listenersCtx.add(fn);
}

function swapTo(ctx: Ctx, incoming: Workspace) {
  if (state.ctx === ctx) {
    putWorkspace(state, incoming);
  } else {
    const outgoing = takeWorkspace(state);
    putWorkspace(state, incoming);
    state.stash = outgoing;
    state.ctx = ctx;
  }
  normalize(state);
  persist();
  listenersCtx.forEach((l) => l());
  notify();
}

/** The mission being played, if the active workspace is a campaign mission. */
export function activeMission(): Mission | null {
  return state.ctx === "mission" && state.campaign ? currentMission(state.campaign) : null;
}

/** What Setup and Simulation may offer right now. */
export function rules(): MissionRules & { scenarioEditor: boolean; json: boolean } {
  const m = activeMission();
  return m ? { ...m.rules, scenarioEditor: false, json: false } : FREE_RULES;
}

export function enterFree() {
  if (state.ctx === "free") return;
  // the mission workspace is kept in the stash for later
  swapTo("free", state.stash ?? freshWorkspace());
}

/** Switch to the current mission's workspace (creating it when the mission starts). */
export function enterMission() {
  const c = state.campaign;
  if (!c) return;
  if (state.ctx === "mission") return;
  const m = currentMission(c);
  if (!m) return;
  const ws = state.stash && sameScenarioName(state.stash.scenario, m) ? state.stash : missionWorkspace(c);
  swapTo("mission", ws);
}

function sameScenarioName(s: Scenario, m: Mission) {
  return s.name === m.scenario.name;
}

function missionWorkspace(c: Campaign): Workspace {
  const m = currentMission(c)!;
  const { design, saved } = startingDesigns(m, c.record);
  return {
    scenario: JSON.parse(JSON.stringify(m.scenario)),
    design,
    saved: saved.map((d, i) => ({ id: `kept${c.index}-${i}`, design: d, savedAt: Date.now() })),
    sim: { ...defaultSim(), assumption: m.rules.simulator[0] },
    lastSim: null,
  };
}

/**
 * Saves from before 0.3's carry-over fix kept the previous mission's design at its old energy, over
 * the new budget, so the comparison could not use it. Fit such kept copies to the current mission.
 */
function refitKept(st: AppState) {
  const m = st.campaign ? currentMission(st.campaign) : null;
  const ws: Workspace | null = st.ctx === "mission" ? st : st.stash;
  if (!m || !ws || !sameScenarioName(ws.scenario, m)) return;
  for (const sd of ws.saved) {
    if (!sd.id.startsWith("kept")) continue;
    const { design, rescaled } = fitDesign(m, sd.design);
    if (rescaled) sd.design = { ...design, name: `${design.name} (energy scaled)` };
  }
}

export function startNewCampaign() {
  state.campaign = newCampaign();
  if (state.ctx === "mission") {
    // replace the old mission workspace in place
    swapTo("mission", missionWorkspace(state.campaign));
  } else {
    state.stash = null;
    enterMission();
  }
}

/** Move on from the current mission (after its battle) to the next one, or to the end of the run. */
export function advanceCampaign() {
  const c = state.campaign;
  if (!c) return;
  c.index++;
  c.phase = "briefing";
  if (currentMission(c)) swapTo("mission", missionWorkspace(c));
  else {
    // run over: back to free training, dropping the mission workspace
    if (state.ctx === "mission") swapTo("free", state.stash ?? freshWorkspace());
    state.stash = null;
    persist();
    notify();
  }
}

export function setPhase(p: Campaign["phase"]) {
  if (!state.campaign) return;
  state.campaign.phase = p;
  persist();
  notify();
}

/** Store a launched battle before it is shown: from now on its outcome is fixed. */
export function recordBattle(rec: BattleRecord) {
  const c = state.campaign;
  if (!c) return;
  c.record = c.record.filter((r) => r.missionId !== rec.missionId);
  c.record.push(rec);
  c.phase = "launched";
  persist();
}

export function dismissHint(id: string) {
  if (!state.campaign || state.campaign.hintsDismissed.includes(id)) return;
  state.campaign.hintsDismissed.push(id);
  persist();
  notify();
}

/** Load a mission fought in the current run into free training, so it can be studied. */
export function studyMission(missionId: string) {
  const r = state.campaign?.record.find((x) => x.missionId === missionId);
  if (!r) return;
  const ws: Workspace = {
    scenario: JSON.parse(JSON.stringify(r.scenario)),
    design: cloneDesign(r.design),
    saved: [],
    sim: defaultSim(),
    lastSim: null,
  };
  if (state.ctx === "free") {
    ws.saved = state.saved;
    swapTo("free", ws);
  } else {
    ws.saved = state.stash?.saved ?? [];
    state.stash = ws;
    persist();
  }
}

export const MISSION_COUNT = missions().length;

/** Keep design and scenario consistent after structural edits. */
export function normalize(st: Workspace) {
  const s = st.scenario;
  const keys = new Set<string>();
  for (const c of s.cannons)
    for (const k of s.classes) {
      const key = targetKey(c.id, k.id);
      keys.add(key);
      if (s.trueEffect[key] === undefined) s.trueEffect[key] = 0;
      if (!s.intel[key]) s.intel[key] = { guess: 0, low: 0, high: 0 };
    }
  for (const k of Object.keys(s.trueEffect)) if (!keys.has(k)) delete s.trueEffect[k];
  for (const k of Object.keys(s.intel)) if (!keys.has(k)) delete s.intel[k];
  const corr: Record<string, number> = {};
  for (let i = 0; i < s.classes.length; i++)
    for (let j = i + 1; j < s.classes.length; j++) {
      const key = corrKey(s.classes[i].id, s.classes[j].id);
      corr[key] = s.classCorrelation[key] ?? s.classCorrelation[corrKey(s.classes[j].id, s.classes[i].id)] ?? 0;
    }
  s.classCorrelation = corr;
  const fixDesign = (d: Design) => {
    for (const k of Object.keys(d.weights)) if (!keys.has(k)) delete d.weights[k];
    d.routes = d.routes.filter((r) => keys.has(r.from) && keys.has(r.to) && r.from !== r.to);
    const ids = new Set([...s.cannons.map((c) => c.id), GC]);
    for (const k of Object.keys(d.energy)) if (!ids.has(k)) delete d.energy[k];
    for (const id of ids) if (d.energy[id] === undefined) d.energy[id] = 0;
  };
  fixDesign(st.design);
  st.saved.forEach((sd) => fixDesign(sd.design));
}

export function cloneDesign(d: Design): Design {
  return JSON.parse(JSON.stringify(d));
}
