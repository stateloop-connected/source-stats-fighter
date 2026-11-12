import { h, pct, num, fill } from "./dom";
import { state } from "./state";
import { bar } from "./charts";
import { runSimulation } from "./simclient";
import { curve } from "./network";
import { compile, effectsFor, energyUsed, targets, validateDesign, type Problem, type Scenario, type Design, type TargetInfo } from "../engine/model";
import { runBattle, goalCount, type BattleResult, type FormationResult } from "../engine/battle";
import { shield } from "../engine/normal";
import { Rng, randomSeed } from "../engine/rng";

/* ---------------- palette & layout ---------------- */

const W = 960;
const H = 540;
const COL = {
  bg: "#04060c",
  grid: "#16324a",
  text: "#c8f7d8",
  dim: "#5d7a8c",
  green: "#39ff88",
  drone: "#4de1ff",
  amber: "#ffb000",
  red: "#ff4d5e",
  wormhole: "#7d5cff",
  planet1: "#0f3b57",
  planet2: "#05121e",
};
const CANNON_COLORS = ["#ff7a3d", "#c07cff", "#4dd2ff"];
const DRONES = 40;
const ZMAX = 5;

interface Layout {
  colW: number;
  rowH: number;
  cellW: number;
  cellH: number;
  cell(c: number, k: number): { x: number; y: number; cx: number; cy: number };
  cannon(c: number): { x: number; y: number };
  gc: { x: number; y: number };
  ship(k: number): { x: number; y: number };
}

function layout(C: number, K: number): Layout {
  const gx0 = 250;
  const gx1 = 740;
  const gy0 = 46;
  const gy1 = 500;
  const colW = (gx1 - gx0) / C;
  const rowH = (gy1 - gy0) / K;
  const cellW = Math.min(200, colW - 26);
  const cellH = Math.min(100, rowH - 18);
  const pcx = -130;
  const pcy = 270;
  const pr = 300;
  return {
    colW,
    rowH,
    cellW,
    cellH,
    cell(c, k) {
      const cx = gx0 + colW * (c + 0.5);
      const cy = gy0 + rowH * (k + 0.5);
      return { x: cx - cellW / 2, y: cy - cellH / 2, cx, cy };
    },
    cannon(c) {
      const y = pcy + (c - (C - 1) / 2) * 120;
      const x = pcx + Math.sqrt(pr * pr - (y - pcy) * (y - pcy));
      return { x, y };
    },
    gc: { x: 60, y: 470 },
    ship(k) {
      return { x: 860, y: gy0 + rowH * (k + 0.5) };
    },
  };
}

/* ---------------- timeline ---------------- */

type Seg =
  | { kind: "arrive"; dur: number }
  | { kind: "fire"; dur: number }
  | { kind: "fall"; step: number; dur: number }
  | { kind: "travel"; step: number; dur: number }
  | { kind: "resolve"; dur: number }
  | { kind: "pause"; dur: number };

function timeline(fr: FormationResult): Seg[] {
  const segs: Seg[] = [
    { kind: "arrive", dur: 700 },
    { kind: "fire", dur: 800 },
  ];
  fr.steps.forEach((st, i) => {
    segs.push({ kind: "fall", step: i, dur: 500 });
    if (st.released.length || st.lost > 0) segs.push({ kind: "travel", step: i, dur: 900 });
  });
  segs.push({ kind: "resolve", dur: 1000 }, { kind: "pause", dur: 350 });
  return segs;
}

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

const stars = (() => {
  const r = new Rng(7);
  return Array.from({ length: 140 }, () => ({ x: r.uniform() * W, y: r.uniform() * H, b: 0.2 + r.uniform() * 0.8, s: r.uniform() < 0.1 ? 1.6 : 0.9 }));
})();

/* ---------------- DOM ---------------- */

let root: HTMLElement;
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let controls: HTMLElement;
let tallyEl: HTMLElement;
let logEl: HTMLElement;
let debriefEl: HTMLElement;
let built = false;

export function battleScreen(container: HTMLElement) {
  root = container;
  if (built) return;
  built = true;
  canvas = h("canvas", { class: "battle-canvas" });
  controls = h("div", { class: "battle-controls" });
  tallyEl = h("div", { class: "tally" });
  logEl = h("ol", { class: "log" });
  debriefEl = h("div", { class: "debrief" });
  root.append(
    controls,
    h("div", { class: "battle-grid" }, h("div", { class: "canvas-wrap" }, canvas), h("div", { class: "battle-side panel" }, h("h2", null, "Tally"), tallyEl, h("h2", null, "Log"), logEl)),
    debriefEl,
  );
  ctx = canvas.getContext("2d")!;
  sizeCanvas();
  window.addEventListener("resize", sizeCanvas);
}

function sizeCanvas() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}

export function showBattle() {
  visible = true;
  renderControls();
  if (!battle) {
    renderTally();
    draw();
  }
  loop();
}

export function hideBattle() {
  visible = false;
  cancelAnimationFrame(raf);
}

function renderControls() {
  const issues = validateDesign(state.scenario, state.design).filter((i) => i.level === "error");
  const speedSel = h(
    "select",
    { onChange: (e: Event) => (speed = parseFloat((e.target as HTMLSelectElement).value)) },
    [0.5, 1, 2, 4, 8, 16].map((v) => h("option", { value: String(v), selected: v === speed }, `${v}×`)),
  );
  const inProgress = battle && battle.fi < battle.problem.formations;
  fill(
    controls,
    h("button", { class: "primary", disabled: issues.length > 0, onClick: () => launch() }, battle ? "Launch new battle" : "Launch battle"),
    inProgress ? h("button", { onClick: () => ((paused = !paused), renderControls()) }, paused ? "Resume" : "Pause") : null,
    inProgress ? h("button", { onClick: () => skip() }, "Skip to end") : null,
    h("label", null, "Speed ", speedSel),
    battle ? h("span", { class: "dim small" }, `Seed ${battle.result.seed} · design “${battle.design.name}”`) : null,
    issues.length ? h("span", { class: "error" }, "✖ Fix the design in Setup before launching.") : null,
  );
}

function launch() {
  const sc: Scenario = JSON.parse(JSON.stringify(state.scenario));
  const d: Design = JSON.parse(JSON.stringify(state.design));
  const problem = compile(sc, d, effectsFor(sc, "truth"));
  const result = runBattle(problem, randomSeed());
  battle = { scenario: sc, design: d, problem, result, ts: targets(sc), fi: 0, t: 0, segs: timeline(result.formations[0]), loggedUpTo: 0 };
  paused = false;
  logEl.replaceChildren();
  debriefEl.replaceChildren();
  renderControls();
  renderTally();
  lastTs = 0;
  loop();
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
  const total = b.segs.reduce((s, x) => s + x.dur, 0);
  const resolveStart = total - b.segs[b.segs.length - 1].dur - b.segs[b.segs.length - 2].dur;
  if (b.t >= resolveStart && b.loggedUpTo === b.fi) {
    logFormation(b.fi);
    b.loggedUpTo = b.fi + 1;
    renderTally();
  }
  if (b.t >= total) {
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
  const done = battle ? battle.loggedUpTo : 0;
  const counts = sc.classes.map((_, k) => (battle ? battle.result.formations.slice(0, done).filter((f) => f.stopped[k]).length : 0));
  fill(
    tallyEl,
    h("div", { class: "dim small" }, `Formation ${Math.min(done, N)} of ${N}`),
    sc.classes.map((k, i) => {
      const need = goalCount(k.goal, N);
      const share = done ? counts[i] / done : 0;
      const missed = done - counts[i];
      const status = counts[i] >= need ? "met" : missed > N - need ? "lost" : "open";
      return h(
        "div",
        { class: `tally-row ${status}` },
        h("div", { class: "row between" }, h("span", null, `${k.name}${k.primary ? " ★" : ""}`), h("span", null, `${counts[i]}/${done}`, h("span", { class: "dim" }, ` (${pct(share)})`))),
        h(
          "div",
          { class: "bar-track" },
          h("div", { class: "bar-fill", style: `width:${(counts[i] / N) * 100}%` }),
          h("div", { class: "bar-marker", style: `left:${(need / N) * 100}%`, title: `goal: ${need} of ${N}` }),
        ),
        h("div", { class: "dim small" }, `goal ${pct(k.goal)} → ${need} of ${N}${status === "met" ? " ✔ met" : status === "lost" ? " ✖ out of reach" : ""}`),
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
      sc.classes.map((k, i) => h("span", { class: fr.stopped[i] ? "ok" : "bad" }, `${k.name} ${fr.stopped[i] ? "✔" : "✖"} `)),
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
        h("td", null, `${r.tally[i]} / ${N} (${pct(r.tally[i] / N)})`),
        h("td", null, pct(k.goal)),
        h("td", { class: r.goalMet[i] ? "ok" : "bad" }, r.goalMet[i] ? "✔ met" : "✖ missed"),
      ),
    ),
  );
  const parts: (HTMLElement | null)[] = [
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
  debriefEl.replaceChildren(h("section", { class: "panel" }, parts));
}

/* ---------------- drawing ---------------- */

function draw() {
  if (!ctx) return;
  const sc = battle?.scenario ?? state.scenario;
  const ts = battle?.ts ?? targets(sc);
  const C = sc.cannons.length;
  const K = sc.classes.length;
  const L = layout(C, K);
  const now = performance.now();

  ctx.fillStyle = COL.bg;
  ctx.fillRect(0, 0, W, H);
  for (const st of stars) {
    ctx.fillStyle = `rgba(200,230,255,${st.b * (0.7 + 0.3 * Math.sin(now / 900 + st.x))})`;
    ctx.fillRect(st.x, st.y, st.s, st.s);
  }

  // planet
  const g = ctx.createRadialGradient(-60, 230, 40, -130, 270, 300);
  g.addColorStop(0, COL.planet1);
  g.addColorStop(1, COL.planet2);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(-130, 270, 300, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(77,225,255,0.45)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // column headers
  ctx.font = "12px 'IBM Plex Mono', ui-monospace, monospace";
  ctx.textAlign = "center";
  sc.cannons.forEach((c, ci) => {
    const p = L.cell(ci, 0);
    ctx.fillStyle = CANNON_COLORS[ci % 3];
    ctx.fillText(c.name.toUpperCase(), p.cx, 26);
  });

  // Ground Control
  ctx.textAlign = "left";
  drawDish(L.gc.x, L.gc.y);
  ctx.fillStyle = COL.text;
  ctx.fillText("GROUND CONTROL", 14, 508);

  // cannons
  sc.cannons.forEach((_, ci) => drawCannon(L.cannon(ci), CANNON_COLORS[ci % 3]));

  // current formation state
  const b = battle;
  const N = b?.problem.formations ?? 0;
  const ended = !!b && b.fi >= N;
  const fr = b ? b.result.formations[Math.min(b.fi, N - 1)] : null;
  const weights0 = b ? b.problem.weights : designWeights(sc, ts);

  let segIdx = -1;
  let segP = 0;
  if (b && !ended) {
    let acc = 0;
    for (let i = 0; i < b.segs.length; i++) {
      if (b.t < acc + b.segs[i].dur) {
        segIdx = i;
        segP = (b.t - acc) / b.segs[i].dur;
        break;
      }
      acc += b.segs[i].dur;
    }
    if (segIdx < 0) {
      segIdx = b.segs.length - 1;
      segP = 1;
    }
  }
  const seg: Seg | null = b && !ended ? b.segs[segIdx] : null;
  const segsBefore = (kind: Seg["kind"]) => !!b && !ended && b.segs.slice(0, segIdx).some((s) => s.kind === kind);
  const fired = ended || (!!seg && (seg.kind === "fire" || segsBefore("fire")));
  const fireP = ended ? 1 : seg?.kind === "fire" ? segP : fired ? 1 : 0;

  // which steps have happened
  let stepsDone = 0; // steps fully completed (drones arrived)
  let fallingStep = -1;
  let travelStep = -1;
  if (fr && seg) {
    for (let i = 0; i < segIdx; i++) {
      const s = b!.segs[i];
      if (s.kind === "fall") stepsDone = Math.max(stepsDone, s.step + (b!.segs[i + 1]?.kind === "travel" ? 0 : 1));
      if (s.kind === "travel") stepsDone = Math.max(stepsDone, s.step + 1);
    }
    if (seg.kind === "fall") fallingStep = seg.step;
    if (seg.kind === "travel") travelStep = seg.step;
  } else if (fr && ended) stepsDone = fr.steps.length;

  const weightsAt = (n: number) => (n === 0 || !fr ? weights0 : fr.steps[n - 1].weightsAfter);
  const fallen = new Set<number>();
  if (fr) {
    const upto = fallingStep >= 0 ? fallingStep + 1 : travelStep >= 0 ? travelStep + 1 : stepsDone;
    for (let i = 0; i < upto; i++) fallen.add(fr.steps[i].target);
  }
  let shown = weightsAt(stepsDone).slice();
  if (travelStep >= 0 && fr) {
    const before = weightsAt(travelStep);
    const after = fr.steps[travelStep].weightsAfter;
    const e = ease(segP);
    shown = before.map((w, i) => w + (after[i] - w) * e);
    shown[fr.steps[travelStep].target] = 0;
  } else if (fallingStep >= 0 && fr) {
    shown = weightsAt(fallingStep).slice();
  }

  // wormholes
  const designG = b ? b.problem.G : null;
  const routes: [number, number, number][] = [];
  if (designG) designG.forEach((row, i) => row.forEach((v, j) => v > 0 && routes.push([i, j, v])));
  else {
    const idx = new Map(ts.map((t) => [t.key, t.index]));
    state.design.routes.forEach((r) => {
      const i = idx.get(r.from);
      const j = idx.get(r.to);
      if (i !== undefined && j !== undefined && r.share > 0) routes.push([i, j, r.share]);
    });
  }
  const centre = (i: number) => {
    const t = ts[i];
    const p = L.cell(t.c, t.k);
    return { x: p.cx, y: p.cy };
  };
  const routeCurve = (i: number, j: number) => {
    const a = ts[i];
    const b2 = ts[j];
    const skips = (a.c === b2.c && Math.abs(a.k - b2.k) > 1) || (a.k === b2.k && Math.abs(a.c - b2.c) > 1);
    const d = Math.hypot(centre(i).x - centre(j).x, centre(i).y - centre(j).y);
    const span = a.c === b2.c ? L.cellW : L.cellH;
    const bow = skips ? (span + 30 - 12) / d : 0.22;
    return curve(centre(i), centre(j), Math.min(L.cellW, L.cellH) / 2, bow);
  };
  for (const [i, j] of routes) {
    const cv = routeCurve(i, j);
    const active = travelStep >= 0 && fr!.steps[travelStep].target === i;
    ctx.strokeStyle = active ? COL.wormhole : "rgba(125,92,255,0.35)";
    ctx.lineWidth = active ? 2.5 : 1.3;
    ctx.setLineDash(active ? [] : [5, 5]);
    ctx.beginPath();
    ctx.moveTo(cv.p0.x, cv.p0.y);
    ctx.quadraticCurveTo(cv.c.x, cv.c.y, cv.p2.x, cv.p2.y);
    ctx.stroke();
    ctx.setLineDash([]);
    arrowHead(cv.c, cv.p2, active ? COL.wormhole : "rgba(125,92,255,0.55)");
  }

  // beams
  if (fr && seg && seg.kind === "fire") {
    ts.forEach((t) => {
      const a = L.cannon(t.c);
      const p = L.cell(t.c, t.k);
      ctx.strokeStyle = CANNON_COLORS[t.c % 3];
      ctx.globalAlpha = 0.8 * (1 - segP);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(a.x + 14, a.y);
      const x = a.x + (p.x - a.x) * Math.min(1, segP * 2.5);
      const y = a.y + (p.cy - a.y) * Math.min(1, segP * 2.5);
      ctx.lineTo(x, y);
      ctx.stroke();
      // tracking line
      ctx.strokeStyle = COL.green;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(L.gc.x, L.gc.y);
      ctx.lineTo(a.x, a.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    });
  }

  // cells
  for (const t of ts) {
    const p = L.cell(t.c, t.k);
    const w = shown[t.index];
    const isFallen = fallen.has(t.index);
    const flashing = fallingStep >= 0 && fr!.steps[fallingStep].target === t.index;
    const stranded = ended || (seg && (seg.kind === "resolve" || seg.kind === "pause"));
    const isStranded = !!stranded && !isFallen && w > 1e-9 && !!fr;
    ctx.fillStyle = isFallen ? (flashing ? `rgba(255,176,0,${0.25 + 0.35 * Math.sin(segP * Math.PI)})` : "rgba(255,176,0,0.14)") : "rgba(10,30,45,0.85)";
    ctx.strokeStyle = isFallen ? COL.amber : isStranded ? COL.dim : "rgba(57,255,136,0.45)";
    ctx.lineWidth = flashing ? 3 : 1.5;
    roundRect(p.x, p.y, L.cellW, L.cellH, 6);
    ctx.fill();
    ctx.stroke();

    // track
    const tx0 = p.x + 10;
    const tx1 = p.x + L.cellW - 10;
    const ty = p.y + L.cellH * 0.42;
    const zx = (z: number) => tx0 + (Math.max(0, Math.min(ZMAX, z)) / ZMAX) * (tx1 - tx0);
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    ctx.fillRect(tx0, ty - 6, tx1 - tx0, 12);
    if (fr && fired) {
      const z = fr.shots[t.index];
      const zz = Number.isFinite(z) ? z : 0;
      ctx.fillStyle = CANNON_COLORS[t.c % 3];
      ctx.fillRect(tx0, ty - 5, (zx(zz) - tx0) * fireP, 10);
      ctx.font = "10px ui-monospace, monospace";
      ctx.textAlign = "left";
      ctx.fillStyle = COL.text;
      if (fireP > 0.6) ctx.fillText(`shot ${num(z, 2)}`, tx0, ty + 18);
    }
    const sh = shield(w, sc.alpha);
    ctx.textAlign = "right";
    ctx.font = "10px ui-monospace, monospace";
    if (Number.isFinite(sh)) {
      const x = zx(sh);
      ctx.strokeStyle = isFallen ? COL.amber : COL.red;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, ty - 11);
      ctx.lineTo(x, ty + 9);
      ctx.stroke();
      ctx.fillStyle = isFallen ? COL.amber : COL.red;
      ctx.fillText(`shield ${sh.toFixed(2)}`, tx1, p.y + 13);
    } else if (!isFallen) {
      ctx.fillStyle = COL.dim;
      ctx.fillText("no drones · shield ∞", tx1, p.y + 13);
    }
    if (isFallen) {
      ctx.textAlign = "left";
      ctx.fillStyle = COL.amber;
      ctx.font = "bold 11px ui-monospace, monospace";
      ctx.fillText("BREACHED", p.x + 8, p.y + 14);
    } else if (isStranded) {
      ctx.textAlign = "left";
      ctx.fillStyle = COL.dim;
      ctx.font = "bold 10px ui-monospace, monospace";
      ctx.fillText("STRANDED", p.x + 8, p.y + 14);
    }

    // drones
    const n = Math.round(w * DRONES);
    drawDroneCluster(p.x + 10, p.y + L.cellH - 18, L.cellW - 20, n, isStranded ? COL.dim : COL.drone, now, t.index);
  }

  // drones in flight
  if (travelStep >= 0 && fr) {
    const st = fr.steps[travelStep];
    const a = centre(st.target);
    st.released.forEach((rel) => {
      const cv = routeCurve(st.target, rel.to);
      const n = Math.max(1, Math.round(rel.amount * DRONES));
      for (let i = 0; i < n; i++) {
        const q = Math.max(0, Math.min(1, segP * 1.4 - (i / n) * 0.4));
        const e = ease(q);
        const x = (1 - e) * (1 - e) * cv.p0.x + 2 * (1 - e) * e * cv.c.x + e * e * cv.p2.x;
        const y = (1 - e) * (1 - e) * cv.p0.y + 2 * (1 - e) * e * cv.c.y + e * e * cv.p2.y;
        ctx.fillStyle = COL.drone;
        ctx.beginPath();
        ctx.arc(x, y, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    if (st.lost > 1e-9) {
      const n = Math.max(1, Math.round(st.lost * DRONES));
      ctx.globalAlpha = Math.max(0, 1 - segP);
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = COL.dim;
        ctx.beginPath();
        ctx.arc(a.x - 20 + (i % 10) * 4, a.y - 10 - segP * 30 - Math.floor(i / 10) * 4, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  // ships
  sc.classes.forEach((cls, k) => {
    const sp = L.ship(k);
    ctx.textAlign = "right";
    ctx.font = "12px ui-monospace, monospace";
    ctx.fillStyle = cls.primary ? COL.text : COL.dim;
    ctx.fillText(`${cls.name.toUpperCase()}${cls.primary ? " ★" : ""}`, W - 12, sp.y - 30);
    if (!fr || ended) return;
    let x = sp.x;
    let alpha = 1;
    if (seg!.kind === "arrive") x = sp.x + (1 - ease(segP)) * 180;
    const stopped = fr.stopped[k];
    if (seg!.kind === "resolve" || seg!.kind === "pause") {
      const q = seg!.kind === "pause" ? 1 : segP;
      if (stopped) {
        drawExplosion(sp.x, sp.y, q, k);
        return;
      }
      x = sp.x - ease(q) * (sp.x - 200);
      alpha = 1 - Math.max(0, q - 0.8) * 5;
      ctx.strokeStyle = `rgba(255,77,94,${0.5 * alpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 18, sp.y);
      ctx.lineTo(Math.min(sp.x, x + 120), sp.y);
      ctx.stroke();
    }
    ctx.globalAlpha = Math.max(0, alpha);
    drawShip(x, sp.y, k);
    ctx.globalAlpha = 1;
  });

  // caption
  ctx.textAlign = "center";
  ctx.font = "13px ui-monospace, monospace";
  ctx.fillStyle = COL.text;
  let caption = "";
  if (!b) caption = "Awaiting launch. The board shows your drones and wormholes as set up.";
  else if (ended) caption = `Battle over: ${N} formations. See the debrief below.`;
  else if (seg && fr) {
    const label = (i: number) => ts[i].label;
    switch (seg.kind) {
      case "arrive":
        caption = `Formation ${b.fi + 1} of ${N} approaching`;
        break;
      case "fire":
        caption = "Cannons fire. A target falls if its shot beats its shield.";
        break;
      case "fall": {
        const st = fr.steps[seg.step];
        caption = `${label(st.target)} breached: shot ${num(fr.shots[st.target])} beats shield ${shield(st.weight, sc.alpha).toFixed(2)}`;
        break;
      }
      case "travel": {
        const st = fr.steps[seg.step];
        caption = st.released.length
          ? `Drones fly: ${st.released.map((r) => `${pct(r.amount)} → ${label(r.to)}`).join(", ")}${st.lost > 1e-9 ? ` · ${pct(st.lost)} lost` : ""}`
          : `No wormholes out: ${pct(st.lost)} of the swarm is lost`;
        break;
      }
      case "resolve":
      case "pause": {
        const strandedW = fr.finalWeights.reduce((s, w, i) => s + (fr.rejected[i] ? 0 : w), 0);
        caption = fr.order.length === 0 ? "No shield broken. The whole formation passes." : `Nothing more can fall.${strandedW > 1e-9 ? ` ${pct(strandedW)} of the swarm is stranded.` : ""}`;
        break;
      }
    }
  }
  ctx.fillText(caption, (250 + 740) / 2, 528);

  if (ended) {
    ctx.fillStyle = "rgba(4,6,12,0.55)";
    ctx.fillRect(0, 0, W, H);
    ctx.font = "bold 36px ui-monospace, monospace";
    ctx.fillStyle = b!.result.allPrimaryMet ? COL.green : COL.red;
    ctx.fillText(b!.result.allPrimaryMet ? "VICTORY" : "DEFEAT", W / 2, H / 2);
    ctx.font = "14px ui-monospace, monospace";
    ctx.fillStyle = COL.text;
    ctx.fillText("Debrief below", W / 2, H / 2 + 30);
  }
}

function designWeights(sc: Scenario, ts: TargetInfo[]) {
  void sc;
  return ts.map((t) => state.design.weights[t.key] ?? 0);
}

const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

function roundRect(x: number, y: number, w: number, hh: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + hh, r);
  ctx.arcTo(x + w, y + hh, x, y + hh, r);
  ctx.arcTo(x, y + hh, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function arrowHead(c: { x: number; y: number }, p: { x: number; y: number }, color: string) {
  const ang = Math.atan2(p.y - c.y, p.x - c.x);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x - 9 * Math.cos(ang - 0.4), p.y - 9 * Math.sin(ang - 0.4));
  ctx.lineTo(p.x - 9 * Math.cos(ang + 0.4), p.y - 9 * Math.sin(ang + 0.4));
  ctx.closePath();
  ctx.fill();
}

function drawDroneCluster(x: number, y: number, w: number, n: number, color: string, now: number, seed: number) {
  const perRow = 20;
  const gap = Math.min(7, w / perRow);
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    const jx = Math.sin(now / 400 + i * 1.7 + seed) * 0.8;
    const jy = Math.cos(now / 500 + i * 2.3 + seed) * 0.8;
    ctx.beginPath();
    ctx.arc(x + col * gap + gap / 2 + jx, y + row * 6 + jy, 1.9, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCannon(p: { x: number; y: number }, color: string) {
  ctx.fillStyle = "#0b1a26";
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 13, Math.PI / 2, -Math.PI / 2, true);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillRect(p.x + 4, p.y - 3, 20, 6);
}

function drawDish(x: number, y: number) {
  ctx.strokeStyle = COL.green;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 16, Math.PI * 1.1, Math.PI * 1.9);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y - 6);
  ctx.lineTo(x, y + 14);
  ctx.moveTo(x - 10, y + 14);
  ctx.lineTo(x + 10, y + 14);
  ctx.stroke();
}

function drawShip(x: number, y: number, k: number) {
  ctx.strokeStyle = COL.red;
  ctx.fillStyle = "rgba(255,77,94,0.18)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  switch (k % 4) {
    case 0: // attack: arrowhead
      ctx.moveTo(x - 20, y);
      ctx.lineTo(x + 16, y - 14);
      ctx.lineTo(x + 8, y);
      ctx.lineTo(x + 16, y + 14);
      break;
    case 1: // recon: diamond with antenna
      ctx.moveTo(x - 18, y);
      ctx.lineTo(x, y - 11);
      ctx.lineTo(x + 18, y);
      ctx.lineTo(x, y + 11);
      break;
    case 2: // supply: hexagon
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i;
        const px = x + 17 * Math.cos(a);
        const py = y + 13 * Math.sin(a);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      break;
    default: // cruiser
      ctx.moveTo(x - 24, y);
      ctx.lineTo(x - 10, y - 9);
      ctx.lineTo(x + 22, y - 9);
      ctx.lineTo(x + 22, y + 9);
      ctx.lineTo(x - 10, y + 9);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawExplosion(x: number, y: number, q: number, k: number) {
  const r = new Rng(1000 + k);
  ctx.globalAlpha = Math.max(0, 1 - q);
  ctx.strokeStyle = COL.amber;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 8 + 40 * q, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = COL.amber;
  for (let i = 0; i < 14; i++) {
    const a = r.uniform() * Math.PI * 2;
    const d = (10 + r.uniform() * 50) * q;
    ctx.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d, 3, 3);
  }
  ctx.globalAlpha = 1;
}
