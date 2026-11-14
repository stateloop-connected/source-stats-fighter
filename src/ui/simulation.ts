import { h, numInput, pct, tip } from "./dom";
import { state, commit, rules, simAllowance, spendSim } from "./state";
import { hints, openHints } from "./hints";
import { panel, type Panel } from "./panel";
import { bar } from "./charts";
import { runSimulation } from "./simclient";
import { compile, effectsFor, energyUsed, targets, validateDesign, type Assumption, type Design } from "../engine/model";
import { mcse, type SimResult } from "../engine/battle";
import { randomSeed } from "../engine/rng";

let running = false;
let progress = 0;
let error = "";
let comparison: { names: string[]; energies: number[]; results: SimResult[]; label: string; skipped: string[] } | null = null;
const unchecked = new Set<string>();

const TIPS = {
  formations:
    "A battle is a series of formations. Each formation sends one ship of every class at each of your cannons, so every class brings cannons × formations ships per battle.",
  goals:
    "How often the battle ends with the goal reached: the share of simulated battles in which at least the goal share of that class's ships was stopped. Primary goals decide victory.",
  stopped:
    "The share of this class's ships stopped, counted over every cannon's lane and every simulated formation. The tick marks the goal. A class can average above its goal and still miss it in many battles.",
  targets:
    "How often each target, one cannon against one ship class, falls in a formation. When a target falls, that cannon's ship of that class is stopped and its drones fly on through the wormholes.",
  side:
    "Drones stranded: the average share of the swarm left on targets that did not fall, and so wasted. False kills: formations in which a target fell although the weapon has no effect on that class; Command's swarm limit keeps this rare.",
};

let mountedIn: HTMLElement | null = null;
let panels: Panel[] = [];
const rerender = () => panels.forEach((p) => p.update());

const ASSUMPTIONS: { id: Assumption; label: string }[] = [
  { id: "intel", label: "Intelligence, best guess" },
  { id: "intelLow", label: "Intelligence, low end of range" },
  { id: "truth", label: "True effects" },
  { id: "custom", label: "Values typed in by hand" },
];

function assumptionLabel() {
  return ASSUMPTIONS.find((a) => a.id === effectiveAssumption())!.label;
}

/** Assumptions the simulator may use here: the mission's rules, and never the truth while it is classified. */
function allowedAssumptions(): Assumption[] {
  const ok = rules().simulator.filter((a) => !(a === "truth" && state.scenario.hideTruth));
  return ok.length ? ok : ["intel"];
}

function effectiveAssumption(): Assumption {
  const a = state.sim.assumption;
  const ok = allowedAssumptions();
  return ok.includes(a) ? a : ok[0];
}

/** Drop the comparison and rebuild on the next render (after the workspace was swapped). */
export function resetSimulation() {
  comparison = null;
  error = "";
  mountedIn = null;
}

function effects() {
  return effectsFor(state.scenario, effectiveAssumption(), state.sim.custom);
}

export function renderSimulation(root: HTMLElement) {
  if (mountedIn !== root) {
    mountedIn = root;
    const sec = () => h("section", { class: "panel" });
    const st = () => state;
    const settings = panel(settingsPanel, () => [st().scenario, st().sim, st().design, running, error, rules().simulator, openHints("simulator"), simAllowance()], sec());
    const compare = panel(comparePanel, () => [st().saved.map((x) => [x.id, x.design.name]), running, simAllowance(), st().sim.battles, [...unchecked]], sec());
    const results = panel(resultsPanel, () => [st().lastSim, st().scenario.classes, st().scenario.cannons, st().scenario.alpha], sec());
    const comp = panel(comparisonPanel, () => [comparison, st().scenario.classes, st().scenario.energyAvailable], h("div"));
    panels = [settings, compare, results, comp];
    root.replaceChildren(h("div", { class: "sim-grid" }, h("div", { class: "col-side" }, settings.el, compare.el), h("div", { class: "col-main" }, results.el, comp.el)));
  }
  rerender();
}

function settingsPanel() {
  const sc = state.scenario;
  const sim = state.sim;
  const ts = targets(sc);
  const issues = validateDesign(sc, state.design).filter((i) => i.level === "error");
  const allowed = rules().simulator;
  const radios = ASSUMPTIONS.filter((a) => allowed.includes(a.id)).map((a) => {
    const disabled = a.id === "truth" && sc.hideTruth;
    return h(
      "label",
      { class: `radio${disabled ? " disabled" : ""}` },
      h("input", { type: "radio", name: "assumption", checked: effectiveAssumption() === a.id, disabled, onChange: () => commit((st) => (st.sim.assumption = a.id)) }),
      ` ${a.label}`,
      disabled ? h("span", { class: "dim" }, " (classified)") : null,
    );
  });
  const custom =
    effectiveAssumption() === "custom"
      ? h(
          "table",
          { class: "grid" },
          h("tr", null, h("th", null, ""), sc.classes.map((k) => h("th", null, k.name))),
          sc.cannons.map((c) =>
            h(
              "tr",
              null,
              h("th", null, c.name),
              sc.classes.map((k) => {
                const t = ts.find((x) => x.cannon.id === c.id && x.cls.id === k.id)!;
                const v = sim.custom[t.key] ?? sc.intel[t.key]?.guess ?? 0;
                return h("td", null, numInput(v, (nv) => commit((st) => (st.sim.custom[t.key] = nv)), { step: 0.05, width: "4.2em" }));
              }),
            ),
          ),
        )
      : null;
  return [
    h("h2", null, "Training simulator"),
    hints("simulator"),
    h("p", { class: "hint" }, "Runs the same battle many times with your current design. The simulator is only as right as its assumptions."),
    radios.length > 1 ? h("div", { class: "radios" }, radios) : h("p", null, "Assumption: ", h("strong", null, assumptionLabel().toLowerCase()), effectiveAssumption() === "truth" ? " (known for this mission)" : ""),
    custom,
    h(
      "div",
      { class: "row wrap" },
      h("label", null, "Battles ", numInput(sim.battles, (v) => commit((st) => (st.sim.battles = Math.max(50, Math.min(200000, Math.round(v))))), { step: 500, width: "6em" })),
      h("label", null, "Seed ", numInput(sim.seed, (v) => commit((st) => (st.sim.seed = Math.abs(Math.round(v)) >>> 0)), { step: 1, width: "7em" })),
      h("button", { class: "small", title: "New random seed", onClick: () => commit((st) => (st.sim.seed = randomSeed())) }, "🎲"),
    ),
    h(
      "p",
      { class: "dim small" },
      `${sim.battles} battles × ${sc.formations} formations = ${(sim.battles * sc.formations).toLocaleString()} formations, ${sc.cannons.length * sc.formations} ships of each class per battle`,
      tip(TIPS.formations),
    ),
    allowanceNote(sim.battles),
    issues.length ? h("p", { class: "error" }, "✖ The design has errors. Fix them in Setup first.") : null,
    h(
      "div",
      { class: "row" },
      h("button", { class: "primary", disabled: running || issues.length > 0 || !affordable(sim.battles), onClick: () => runCurrent() }, running ? "Simulating…" : "Run simulation"),
      running ? h("div", { class: "meter" }, h("div", { class: "meter-fill", style: `width:${progress * 100}%` })) : null,
    ),
    error ? h("p", { class: "error" }, error) : null,
  ];
}

const affordable = (battles: number) => {
  const a = simAllowance();
  return !a || battles <= a.left;
};

/** In a mission with rationed simulator time: what is left, and what this run would cost. */
function allowanceNote(cost: number) {
  const a = simAllowance();
  if (!a) return null;
  return h(
    "p",
    { class: a.left < cost ? "warn-text small" : "small" },
    `Simulator allowance: ${a.left.toLocaleString()} of ${a.total.toLocaleString()} battles left. `,
    a.left < cost ? "Not enough for this run: lower the number of battles." : `This run uses ${cost.toLocaleString()}.`,
    tip("Command rations simulator time on this mission. A small run gives a rough answer with wide whiskers; a precise one uses more of the allowance. Each design in a comparison costs the full number of battles."),
  );
}

async function runCurrent() {
  const sc = state.scenario;
  if (!spendSim(state.sim.battles)) return;
  error = "";
  running = true;
  progress = 0;
  rerender();
  try {
    const p = compile(sc, state.design, effects());
    const [res] = await runSimulation("sim", [p], state.sim.battles, state.sim.seed, (f) => {
      progress = f;
      const m = document.querySelector<HTMLElement>(".sim-grid .meter-fill");
      if (m) m.style.width = `${f * 100}%`;
    });
    commit((st) => (st.lastSim = { result: res, label: `“${st.design.name}” under ${assumptionLabel().toLowerCase()}` }), true);
  } catch (e) {
    if ((e as Error).message !== "cancelled") error = (e as Error).message;
  }
  running = false;
  rerender();
}

function resultsPanel() {
  const sc = state.scenario;
  const last = state.lastSim;
  if (!last) return [h("h2", null, "Results"), h("p", { class: "dim" }, "Run the simulator to see how often each goal is met.")];
  const r = last.result;
  const ts = targets(sc);
  if (r.targetFall.length !== ts.length || r.classStop.length !== sc.classes.length || r.ships === undefined)
    return [h("h2", null, "Results"), h("p", { class: "dim" }, "The scenario has changed since the last run. Run the simulator again.")];
  const nf = r.battles * r.formations;
  const ns = r.battles * r.ships;
  return [
    h("h2", null, "Results ", h("span", { class: "dim small" }, `— ${last.label}, ${r.battles} battles`)),
    h("h3", null, "Goals met (share of battles)", tip(TIPS.goals)),
    sc.classes.map((k, i) =>
      bar({ label: `${k.name}${k.primary ? " ★" : ""}`, sub: `stop ≥ ${pct(k.goal)} of ${r.ships} ships`, value: r.goalMet[i], n: r.battles }),
    ),
    bar({ label: h("strong", null, "All primary goals"), value: r.allPrimary, n: r.battles }),
    h("h3", null, "Ships stopped (share of ships, all lanes)", tip(TIPS.stopped)),
    sc.classes.map((k, i) => bar({ label: k.name, value: r.classStop[i], n: ns, marker: k.goal, markerLabel: "goal", sense: "good" })),
    h("h3", null, "Targets falling (share of formations)", tip(TIPS.targets)),
    ts.map((t) => bar({ label: t.label, value: r.targetFall[t.index], n: nf })),
    h("h3", null, "Side effects", tip(TIPS.side)),
    bar({ label: "Drones stranded", sub: "mean share of swarm per formation", value: r.stranded, n: nf }),
    r.falseKill === null
      ? h("p", { class: "dim" }, "False kills: none possible, no target is immune under these assumptions.")
      : bar({ label: "False kills", sub: "formations with ≥ 1", value: r.falseKill, n: nf, marker: sc.alpha, markerLabel: "Command limit", sense: "bad", max: Math.max(0.1, sc.alpha * 3) }),
    h("p", { class: "hint" }, "Whiskers show 95% Monte Carlo intervals. The tick on each bar is the goal (or Command's limit for false kills)."),
  ];
}

const compareCost = () => state.sim.battles * (1 + state.saved.filter((sd) => !unchecked.has(sd.id)).length);

function comparePanel() {
  const saved = state.saved;
  return [
    h("h2", null, "Compare designs"),
    saved.length === 0
      ? h("p", { class: "dim" }, "Save designs in Setup to compare them here under the same assumptions and seed.")
      : h(
          "div",
          null,
          h(
            "ul",
            { class: "saved" },
            saved.map((sd) =>
              h(
                "li",
                null,
                h(
                  "label",
                  null,
                  h("input", {
                    type: "checkbox",
                    checked: !unchecked.has(sd.id),
                    onChange: (e: Event) => {
                      if ((e.target as HTMLInputElement).checked) unchecked.delete(sd.id);
                      else unchecked.add(sd.id);
                      rerender();
                    },
                  }),
                  ` ${sd.design.name}`,
                ),
              ),
            ),
          ),
          h("p", { class: "dim small" }, "The current design is always included."),
          allowanceNote(compareCost()),
          h("button", { disabled: running || !affordable(compareCost()), onClick: () => runComparison() }, "Compare under these assumptions"),
        ),
  ];
}

async function runComparison() {
  const sc = state.scenario;
  const designs: Design[] = [state.design, ...state.saved.filter((sd) => !unchecked.has(sd.id)).map((sd) => sd.design)];
  const valid = designs.filter((d) => validateDesign(sc, d).every((i) => i.level !== "error"));
  const skipped = designs.filter((d) => !valid.includes(d)).map((d) => `${d.name}: ${validateDesign(sc, d).find((i) => i.level === "error")!.message}`);
  if (!valid.length) {
    error = `None of the designs can fight this battle. ${skipped.join(" ")}`;
    rerender();
    return;
  }
  if (!spendSim(state.sim.battles * valid.length)) return;
  error = "";
  running = true;
  progress = 0;
  rerender();
  try {
    const eff = effects();
    const problems = valid.map((d) => compile(sc, d, eff));
    const results = await runSimulation("sim", problems, state.sim.battles, state.sim.seed, (f) => {
      const m = document.querySelector<HTMLElement>(".sim-grid .meter-fill");
      if (m) m.style.width = `${f * 100}%`;
    });
    comparison = {
      names: valid.map((d, i) => (i === 0 ? `${d.name} (current)` : d.name)),
      energies: valid.map((d) => energyUsed(sc, d)),
      results,
      label: assumptionLabel(),
      skipped,
    };
  } catch (e) {
    if ((e as Error).message !== "cancelled") error = (e as Error).message;
  }
  running = false;
  rerender();
}

function comparisonPanel() {
  if (!comparison) return null;
  const sc = state.scenario;
  const c = comparison;
  if (c.results.some((r) => r.goalMet.length !== sc.classes.length || r.ships === undefined)) return null;
  const n = c.results[0].battles;
  const nf = n * c.results[0].formations;
  const ns = n * c.results[0].ships;
  const cell = (v: number, nn: number, best: boolean) => h("td", { class: best ? "best" : "" }, pct(v, 1), h("span", { class: "dim small" }, ` ±${(1.96 * mcse(v, nn) * 100).toFixed(1)}`));
  const row = (label: string, vals: number[], nn: number, higherBetter = true) => {
    const best = higherBetter ? Math.max(...vals) : Math.min(...vals);
    return h("tr", null, h("th", null, label), vals.map((v) => cell(v, nn, vals.length > 1 && v === best)));
  };
  const rows = [
    row("All primary goals", c.results.map((r) => r.allPrimary), n),
    ...sc.classes.map((k, i) => row(`Goal: ${k.name} ≥ ${pct(k.goal)}`, c.results.map((r) => r.goalMet[i]), n)),
    ...sc.classes.map((k, i) => row(`Stopped: ${k.name}`, c.results.map((r) => r.classStop[i]), ns)),
    row("Drones stranded", c.results.map((r) => r.stranded), nf, false),
  ];
  if (c.results.every((r) => r.falseKill !== null)) rows.push(row("False kills", c.results.map((r) => r.falseKill!), nf, false));
  return h(
    "section",
    { class: "panel" },
    h("h2", null, "Comparison ", h("span", { class: "dim small" }, `— ${c.label}, ${n} battles each, same seed`)),
    h(
      "div",
      { class: "scroll-x" },
      h(
        "table",
        { class: "grid compare" },
        h("tr", null, h("th", null, ""), c.names.map((nm) => h("th", null, nm))),
        h("tr", null, h("th", null, "Energy used"), c.energies.map((e) => h("td", null, `${e} / ${sc.energyAvailable}`))),
        rows,
      ),
    ),
    c.skipped.length ? h("p", { class: "warn small" }, `Left out because they cannot fight this battle — ${c.skipped.join(" · ")}`) : null,
  );
}
