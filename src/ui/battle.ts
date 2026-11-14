import { h, pct, num, fill } from "./dom";
import { state, activeMission, recordBattle, advanceCampaign } from "./state";
import { art } from "./art";
import { hints } from "./hints";
import { currentRecord } from "../engine/campaign";
import type { View } from "./campaign";
import { bar } from "./charts";
import { runSimulation } from "./simclient";
import { compile, effectsFor, energyUsed, targets, validateDesign, type Problem, type Scenario, type Design, type TargetInfo } from "../engine/model";
import { runBattle, goalCount, type BattleResult } from "../engine/battle";
import { shield } from "../engine/normal";
import { randomSeed } from "../engine/rng";
import { timeline, momentAt, totalDuration, HIT_AT, type Seg, type Moment } from "./timeline";
import { drawField, FW, FH } from "./battlefield";
import { drawStats, SW } from "./stats";

/* ---------------- battle state ---------------- */

interface Battle {
  scenario: Scenario;
  design: Design;
  problem: Problem;
  result: BattleResult;
  ts: TargetInfo[];
  fi: number;
  t: number;
  segs: Seg[];
  loggedUpTo: number;
}

let battle: Battle | null = null;
let speed = 1;
let paused = false;
let visible = false;
let raf = 0;
let lastTs = 0;

/* ---------------- DOM ---------------- */

let root: HTMLElement;
let field: HTMLCanvasElement;
let fieldCtx: CanvasRenderingContext2D;
let statsCanvas: HTMLCanvasElement;
let statsCtx: CanvasRenderingContext2D;
let captionEl: HTMLElement;
let controls: HTMLElement;
let tallyEl: HTMLElement;
let logEl: HTMLElement;
let debriefEl: HTMLElement;
let hintsEl: HTMLElement;
let built = false;
let onContinue: (v: View) => void = () => {};

export function battleScreen(container: HTMLElement, opts: { onContinue: (v: View) => void }) {
  root = container;
  onContinue = opts.onContinue;
  if (built) return;
  built = true;
  hintsEl = h("div");
  field = h("canvas", { class: "battle-field", "aria-label": "Battlefield" });
  statsCanvas = h("canvas", { class: "battle-stats", "aria-label": "Ship stats: impact against shield for every ship" });
  captionEl = h("div", { class: "battle-caption", "aria-live": "polite" });
  controls = h("div", { class: "battle-controls" });
  tallyEl = h("div", { class: "tally" });
  logEl = h("ol", { class: "log" });
  debriefEl = h("div", { class: "debrief" });
  root.append(
    hintsEl,
    controls,
    h("div", { class: "battle-boards" }, h("div", { class: "canvas-wrap field-wrap" }, field), h("div", { class: "canvas-wrap stats-wrap" }, statsCanvas)),
    captionEl,
    h("div", { class: "battle-grid" }, h("section", { class: "panel" }, h("h2", null, "Tally"), tallyEl), h("section", { class: "panel" }, h("h2", null, "Log"), logEl)),
    debriefEl,
  );
  fieldCtx = field.getContext("2d")!;
  statsCtx = statsCanvas.getContext("2d")!;
  sizeCanvas();
  window.addEventListener("resize", sizeCanvas);
}

function sizeCanvas() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  field.width = FW * dpr;
  field.height = FH * dpr;
  fieldCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  statsCanvas.width = SW * dpr;
  statsCanvas.height = FH * dpr;
  statsCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}

/** Drop the battle on screen (after the workspace was swapped). */
export function resetBattle() {
  battle = null;
  paused = false;
  if (!built) return;
  logEl.replaceChildren();
  debriefEl.replaceChildren();
}

export function showBattle() {
  visible = true;
  if (!battle) restore();
  hintsEl.replaceChildren(...hints("battle"));
  renderControls();
  if (!battle) renderTally();
  draw();
  loop();
}

export function hideBattle() {
  visible = false;
  cancelAnimationFrame(raf);
}

/** In a campaign, a battle already launched is shown again from its stored record, at its end. */
function restore() {
  const c = state.campaign;
  if (!activeMission() || !c || c.phase !== "launched") return;
  const rec = currentRecord(c);
  if (!rec) return;
  const problem = compile(rec.scenario, rec.design, effectsFor(rec.scenario, "truth"));
  const result = runBattle(problem, rec.seed);
  battle = { scenario: rec.scenario, design: rec.design, problem, result, ts: targets(rec.scenario), fi: 0, t: 0, segs: timeline(result.formations[0]), loggedUpTo: 0 };
  logEl.replaceChildren();
  skip();
}

function replay() {
  const b = battle;
  if (!b) return;
  b.fi = 0;
  b.t = 0;
  b.loggedUpTo = 0;
  b.segs = timeline(b.result.formations[0]);
  paused = false;
  logEl.replaceChildren();
  debriefEl.replaceChildren();
  renderControls();
  renderTally();
  lastTs = 0;
  loop();
}

function renderControls() {
  const issues = validateDesign(state.scenario, state.design).filter((i) => i.level === "error");
  const mission = activeMission();
  const speedSel = h(
    "select",
    { onChange: (e: Event) => (speed = parseFloat((e.target as HTMLSelectElement).value)) },
    [0.25, 0.5, 1, 2, 4, 8, 16].map((v) => h("option", { value: String(v), selected: v === speed }, `${v}×`)),
  );
  const inProgress = battle && battle.fi < battle.problem.formations;
  const ended = battle && !inProgress;
  const launchBtn = mission
    ? battle
      ? ended
        ? h("button", { onClick: () => replay() }, "Watch again")
        : null
      : h("button", { class: "primary", disabled: issues.length > 0, onClick: () => launch() }, "Launch battle")
    : h("button", { class: "primary", disabled: issues.length > 0, onClick: () => launch() }, battle ? "Launch new battle" : "Launch battle");
  fill(
    controls,
    launchBtn,
    inProgress ? h("button", { onClick: () => ((paused = !paused), renderControls()) }, paused ? "Resume" : "Pause") : null,
    inProgress ? h("button", { onClick: () => nextFormation() }, "Next formation") : null,
    inProgress ? h("button", { onClick: () => skip() }, "Skip to end") : null,
    h("label", null, "Speed ", speedSel),
    battle ? h("span", { class: "dim small" }, `Seed ${battle.result.seed} · design “${battle.design.name}”`) : null,
    !battle && issues.length ? h("span", { class: "error" }, "✖ Fix the design in Setup before launching.") : null,
    mission && !battle && !issues.length ? h("span", { class: "warn-text small" }, "Launching is final: this battle is fought once.") : null,
  );
}

function launch() {
  const mission = activeMission();
  if (mission && !confirm(`Launch the battle for “${mission.title}” with the design “${state.design.name}”? It is fought once, and the outcome stands.`)) return;
  const sc: Scenario = JSON.parse(JSON.stringify(state.scenario));
  const d: Design = JSON.parse(JSON.stringify(state.design));
  const problem = compile(sc, d, effectsFor(sc, "truth"));
  const result = runBattle(problem, randomSeed());
  // the outcome is fixed and stored before anything is shown
  if (mission)
    recordBattle({
      missionId: mission.id,
      scenario: sc,
      design: d,
      seed: result.seed,
      launchedAt: Date.now(),
      won: result.allPrimaryMet,
      tally: result.tally,
      energyUsed: energyUsed(sc, d),
    });
  battle = { scenario: sc, design: d, problem, result, ts: targets(sc), fi: 0, t: 0, segs: timeline(result.formations[0]), loggedUpTo: 0 };
  paused = false;
  logEl.replaceChildren();
  debriefEl.replaceChildren();
  renderControls();
  renderTally();
  lastTs = 0;
  loop();
}

function nextFormation() {
  const b = battle;
  if (!b || b.fi >= b.problem.formations) return;
  if (b.loggedUpTo === b.fi) {
    logFormation(b.fi);
    b.loggedUpTo = b.fi + 1;
    renderTally();
  }
  b.fi++;
  b.t = 0;
  if (b.fi >= b.problem.formations) finish();
  else b.segs = timeline(b.result.formations[b.fi]);
}

function skip() {
  if (!battle) return;
  while (battle.loggedUpTo < battle.problem.formations) logFormation(battle.loggedUpTo++);
  battle.fi = battle.problem.formations;
  battle.t = 0;
  finish();
}

function finish() {
  renderControls();
  renderTally();
  renderDebrief();
  draw();
}

function loop() {
  cancelAnimationFrame(raf);
  if (!visible) return;
  raf = requestAnimationFrame((ts) => {
    const dt = lastTs ? Math.min(100, ts - lastTs) : 16;
    lastTs = ts;
    if (battle && !paused && battle.fi < battle.problem.formations) advance(dt * speed);
    draw();
    loop();
  });
}

function advance(dt: number) {
  const b = battle!;
  b.t += dt;
  const fr = b.result.formations[b.fi];
  if (b.loggedUpTo === b.fi && momentAt(fr, b.problem.weights, b.segs, b.t).counted) {
    logFormation(b.fi);
    b.loggedUpTo = b.fi + 1;
    renderTally();
  }
  if (b.t >= totalDuration(b.segs)) {
    b.fi++;
    b.t = 0;
    if (b.fi >= b.problem.formations) finish();
    else b.segs = timeline(b.result.formations[b.fi]);
  }
}

/* ---------------- tally & log ---------------- */

function renderTally() {
  const sc = battle?.scenario ?? state.scenario;
  const N = battle?.problem.formations ?? sc.formations;
  const C = sc.cannons.length;
  const ships = C * N;
  const done = battle ? battle.loggedUpTo : 0;
  const counts = sc.classes.map((_, k) => (battle ? battle.result.formations.slice(0, done).reduce((n, f) => n + f.stopped[k], 0) : 0));
  fill(
    tallyEl,
    h("div", { class: "dim small" }, `Formation ${Math.min(done, N)} of ${N} · ${C} lane${C === 1 ? "" : "s"}`),
    sc.classes.map((k, i) => {
      const need = goalCount(k.goal, ships);
      const seen = done * C;
      const share = seen ? counts[i] / seen : 0;
      const missed = seen - counts[i];
      const status = counts[i] >= need ? "met" : missed > ships - need ? "lost" : "open";
      return h(
        "div",
        { class: `tally-row ${status}` },
        h("div", { class: "row between" }, h("span", null, `${k.name}${k.primary ? " ★" : ""}`), h("span", null, `${counts[i]}/${seen}`, h("span", { class: "dim" }, ` (${pct(share)})`))),
        h(
          "div",
          { class: "bar-track" },
          h("div", { class: "bar-fill", style: `width:${(counts[i] / ships) * 100}%` }),
          h("div", { class: "bar-marker", style: `left:${(need / ships) * 100}%`, title: `goal: ${need} of ${ships}` }),
        ),
        h("div", { class: "dim small" }, `goal ${pct(k.goal)} → ${need} of ${ships} ships${status === "met" ? " ✔ met" : status === "lost" ? " ✖ out of reach" : ""}`),
      );
    }),
  );
}

function logFormation(fi: number) {
  const b = battle!;
  const fr = b.result.formations[fi];
  const sc = b.scenario;
  const stranded = fr.finalWeights.reduce((s, w, i) => s + (fr.rejected[i] ? 0 : w), 0);
  logEl.prepend(
    h(
      "li",
      null,
      h("span", { class: "dim" }, `#${fi + 1} `),
      sc.classes.map((k, i) => h("span", { class: fr.stopped[i] === sc.cannons.length ? "ok" : fr.stopped[i] ? "warn-text" : "bad" }, `${k.name} ${fr.stopped[i]}/${sc.cannons.length} `)),
      h("span", { class: "dim" }, `· ${fr.order.length} breach${fr.order.length === 1 ? "" : "es"}${stranded > 1e-9 ? ` · ${pct(stranded)} stranded` : ""}`),
    ),
  );
}

/* ---------------- debrief ---------------- */

function renderDebrief() {
  const b = battle!;
  const sc = b.scenario;
  const r = b.result;
  const N = b.problem.formations;
  const used = energyUsed(sc, b.design);
  const win = r.allPrimaryMet;
  const falls = b.ts.map((t) => r.formations.filter((f) => f.rejected[t.index]).length);
  const falseKills = b.ts.map((t) => r.formations.filter((f) => f.falseKills.includes(t.index)).length);
  const goals = h(
    "table",
    { class: "grid" },
    h("tr", null, h("th", null, "Class"), h("th", null, "Stopped"), h("th", null, "Goal"), h("th", null, "")),
    sc.classes.map((k, i) =>
      h(
        "tr",
        null,
        h("td", null, `${k.name}${k.primary ? " ★ primary" : ""}`),
        h("td", null, `${r.tally[i]} / ${r.ships} (${pct(r.tally[i] / r.ships)})`),
        h("td", null, pct(k.goal)),
        h("td", { class: r.goalMet[i] ? "ok" : "bad" }, r.goalMet[i] ? "✔ met" : "✖ missed"),
      ),
    ),
  );
  const mission = activeMission();
  const parts: (HTMLElement | null)[] = [
    mission ? art(win ? "victory" : "defeat", 320, 120, { fallback: win ? "wreckage" : "fleet", maxScale: 3, class: "mission-art" }) : null,
    h("h2", { class: win ? "victory" : "defeat" }, win ? "VICTORY — all primary goals met" : "DEFEAT — a primary goal was missed"),
    goals,
    h("p", null, `Energy used: ${used} of ${sc.energyAvailable}${used < sc.energyAvailable ? ` (${sc.energyAvailable - used} returned to the reserve)` : ""}.`),
  ];
  if (win) {
    const odds = h("div", null, h("p", { class: "dim" }, "Computing the true odds of this design…"));
    parts.push(
      h("h3", null, "Wreckage analysis"),
      h("p", { class: "hint" }, "Scavenger units have examined the wreckage. The true effectiveness of each weapon is now known."),
      h(
        "table",
        { class: "grid" },
        h("tr", null, h("th", null, "Target"), h("th", null, "Intel"), h("th", null, "True"), h("th", null, "Fell"), h("th", null, "False kills")),
        b.ts.map((t, i) => {
          const it = sc.intel[t.key];
          const tr = sc.trueEffect[t.key];
          return h(
            "tr",
            null,
            h("td", null, t.label),
            h("td", null, `${it.guess} (${it.low}–${it.high})`),
            h("td", { class: tr <= 0 ? "bad" : tr < it.low || tr > it.high ? "warn-text" : "" }, `${tr}${tr <= 0 ? " immune" : ""}`),
            h("td", null, `${falls[i]} / ${N}`),
            h("td", { class: falseKills[i] ? "bad" : "dim" }, falseKills[i] ? `${falseKills[i]} — ships played dead` : "–"),
          );
        }),
      ),
      h("h3", null, "How often this design would have won"),
      odds,
    );
    const p = compile(sc, b.design, effectsFor(sc, "truth"));
    runSimulation("debrief", [p], 4000, r.seed ^ 0x5eed)
      .then(([res]) => {
        const remark =
          res.allPrimary < 0.5
            ? "Command notes: a reckless design. You were lucky today."
            : res.allPrimary >= 0.9
              ? "Command notes: a sound design. Victory was expected."
              : "Command notes: a fair risk, well taken.";
        fill(
          odds,
          bar({ label: h("strong", null, "All primary goals"), value: res.allPrimary, n: res.battles }),
          sc.classes.map((k, i) => bar({ label: `${k.name}${k.primary ? " ★" : ""}`, sub: `stop ≥ ${pct(k.goal)}`, value: res.goalMet[i], n: res.battles })),
          h("p", { class: "remark" }, remark),
        );
      })
      .catch(() => {});
  } else {
    parts.push(
      h("h3", null, "No wreckage to analyse"),
      h("p", { class: "hint" }, "Without wreckage the true effectiveness stays unknown. All Command has are the observed kill rates:"),
      h(
        "table",
        { class: "grid" },
        h("tr", null, h("th", null, "Target"), h("th", null, "Intel"), h("th", null, "Fell")),
        b.ts.map((t, i) => {
          const it = sc.intel[t.key];
          return h("tr", null, h("td", null, t.label), h("td", null, `${it.guess} (${it.low}–${it.high})`), h("td", null, `${falls[i]} / ${N} (${pct(falls[i] / N)})`));
        }),
      ),
      h("p", { class: "remark" }, "Command notes: if a target fell far less often than intelligence promised, consider that intelligence may be wrong. Try the simulator with the low end of the range."),
    );
  }
  if (mission) {
    parts.push(
      h(
        "div",
        { class: "row continue" },
        h(
          "button",
          {
            class: "primary",
            onClick: () => {
              advanceCampaign();
              onContinue(activeMission() ? "briefing" : "end");
            },
          },
          "Continue",
        ),
        h("span", { class: "dim small" }, "The campaign moves on to the next mission."),
      ),
    );
  }
  debriefEl.replaceChildren(h("section", { class: "panel" }, parts));
}

/* ---------------- drawing ---------------- */

let lastCaption = "";

function draw() {
  if (!fieldCtx) return;
  const b = battle;
  const sc = b?.scenario ?? state.scenario;
  const design = b?.design ?? state.design;
  const ts = b?.ts ?? targets(sc);
  const N = b?.problem.formations ?? sc.formations;
  const ended = !!b && b.fi >= N;
  const fr = b && !ended ? b.result.formations[b.fi] : null;
  const mo: Moment | null = b && fr ? momentAt(fr, b.problem.weights, b.segs, b.t) : null;
  const idleWeights = ts.map((t) => design.weights[t.key] ?? 0);
  const now = performance.now();
  drawField(fieldCtx, { sc, design, fr, mo, now, idleWeights, ended: ended ? { win: b!.result.allPrimaryMet } : null });
  drawStats(statsCtx, { sc, fr, mo, idleWeights });
  const cap = caption(b, fr, mo, ended);
  if (cap !== lastCaption) {
    lastCaption = cap;
    captionEl.textContent = cap;
  }
}

function caption(b: Battle | null, fr: Battle["result"]["formations"][number] | null, mo: Moment | null, ended: boolean): string {
  if (!b) return "Awaiting launch. The board shows your drones as set up; each cannon faces its own column of ships.";
  const N = b.problem.formations;
  if (ended) return `Battle over after ${N} formations. See the debrief below.`;
  if (!fr || !mo) return "";
  const sc = b.scenario;
  const label = (i: number) => b.ts[i].label;
  const head = `Formation ${b.fi + 1} of ${N}: `;
  switch (mo.seg.kind) {
    case "arrive":
      return `${head}approaching.`;
    case "fire": {
      const round = mo.seg.round;
      if (!mo.firedAt.some(Boolean)) return `${head}${round === 0 ? "no ship holds drones, so the cannons hold fire." : "no standing ship holds drones; the cannons hold fire."}`;
      if (mo.q < HIT_AT) return `${head}${round === 0 ? "cannons fire" : "cannons fire again"}.`;
      const breaking = mo.revealed.map((r, i) => r && !mo.fallen[i] && fr.shots[i] > shield(mo.weights[i], sc.alpha)).some(Boolean);
      return `${head}${breaking ? "a shield gives way." : round === 0 ? "no impact beats its shield." : "no further shield gives way."}`;
    }
    case "fall": {
      const st = fr.steps[mo.seg.step];
      return `${head}${label(st.target)} breached: impact ${num(fr.shots[st.target])} beats shield ${num(shield(st.weight, sc.alpha))}.`;
    }
    case "travel": {
      const st = fr.steps[mo.seg.step];
      return st.released.length
        ? `${head}drones fly on: ${st.released.map((r) => `${pct(r.amount)} → ${label(r.to)}`).join(", ")}${st.lost > 1e-9 ? `; ${pct(st.lost)} lost` : ""}.`
        : `${head}no wormhole out, ${pct(st.lost)} of the swarm is lost.`;
    }
    case "resolve":
    case "pause": {
      const stranded = fr.finalWeights.reduce((s, w, i) => s + (fr.rejected[i] ? 0 : w), 0);
      const passed = fr.rejected.filter((r) => !r).length;
      return `${head}${fr.order.length === 0 ? "no shield broken, the whole formation passes." : `${fr.order.length} ship${fr.order.length === 1 ? "" : "s"} stopped, ${passed} pass${passed === 1 ? "es" : ""}.`}${stranded > 1e-9 ? ` ${pct(stranded)} of the swarm is stranded.` : ""}`;
    }
  }
  return "";
}

/* ---------------- development hook: jump to a moment (not in production builds) ---------------- */

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__battle = {
    launch,
    /** Pause at formation fi, at the segment of the given kind (nth occurrence), progress q. */
    seek(fi: number, kind: Seg["kind"], q = 0.5, nth = 0) {
      const b = battle;
      if (!b) return "no battle";
      b.fi = fi;
      b.segs = timeline(b.result.formations[fi]);
      let acc = 0;
      let seen = 0;
      for (const s of b.segs) {
        if (s.kind === kind && seen++ === nth) {
          b.t = acc + s.dur * q;
          paused = true;
          renderControls();
          draw();
          return { steps: b.result.formations[fi].steps.length, segs: b.segs.map((x) => x.kind) };
        }
        acc += s.dur;
      }
      return "segment not found";
    },
    formations: () => battle?.result.formations.map((f) => f.steps.length),
  };
}
