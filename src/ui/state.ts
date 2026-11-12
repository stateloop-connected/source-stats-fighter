import { corrKey, defaultDesign, defaultScenario, GC, targetKey, type Assumption, type Design, type Scenario } from "../engine/model";
import type { SimResult } from "../engine/battle";

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

export interface AppState {
  scenario: Scenario;
  design: Design;
  saved: SavedDesign[];
  sim: SimSettings;
  lastSim: { result: SimResult; label: string } | null;
}

const KEY = "alphawars89.state.v1";

function fresh(): AppState {
  return {
    scenario: defaultScenario(),
    design: defaultDesign(),
    saved: [],
    sim: { assumption: "intel", battles: 2000, seed: 1989, custom: {} },
    lastSim: null,
  };
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const st = JSON.parse(raw) as AppState;
      if (st && st.scenario && st.design) return { ...fresh(), ...st };
    }
  } catch {
    /* storage unavailable or corrupt */
  }
  return fresh();
}

export const state: AppState = load();

const listeners = new Set<() => void>();
export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

/** Mutate state, save, and notify listeners (unless quiet). */
export function commit(fn: (s: AppState) => void, quiet = false) {
  fn(state);
  normalize(state);
  persist();
  if (!quiet) listeners.forEach((l) => l());
}

export function resetAll() {
  const f = fresh();
  Object.assign(state, f);
  persist();
  listeners.forEach((l) => l());
}

/** Keep design and scenario consistent after structural edits. */
export function normalize(st: AppState) {
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
