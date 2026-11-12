import { h, numInput, pct } from "./dom";
import { state, commit } from "./state";
import { bar } from "./charts";
import { runSimulation } from "./simclient";
import { compile, effectsFor, energyUsed, targets, validateDesign, type Assumption, type Design } from "../engine/model";
import { mcse, type SimResult } from "../engine/battle";
import { randomSeed } from "../engine/rng";

let running = false;
let progress = 0;
let error = "";
let comparison: { names: string[]; energies: number[]; results: SimResult[]; label: string } | null = null;
const unchecked = new Set<string>();
let rerender: () => void = () => {};

const ASSUMPTIONS: { id: Assumption; label: string }[] = [
  { id: "intel", label: "Intelligence, best guess" },
  { id: "intelLow", label: "Intelligence, low end of range" },
  { id: "truth", label: "True effects" },
  { id: "custom", label: "Values typed in by hand" },
];

function assumptionLabel() {
  return ASSUMPTIONS.find((a) => a.id === effectiveAssumption())!.label;
}

function effectiveAssumption(): Assumption {
  const a = state.sim.assumption;
  return a === "truth" && state.scenario.hideTruth ? "intel" : a;
}

function effects() {
  return effectsFor(state.scenario, effectiveAssumption(), state.sim.custom);
}

export function renderSimulation(root: HTMLElement) {
  rerender = () => renderSimulation(root);
  root.replaceChildren(h("div", { class: "sim-grid" }, h("div", { class: "col-side" }, settingsPanel(), comparePanel()), h("div", { class: "col-main" }, resultsPanel(), comparisonPanel())));
}

function settingsPanel() {
  const sc = state.scenario;
  const sim = state.sim;
  const ts = targets(sc);
  const issues = validateDesign(sc, state.design).filter((i) => i.level === "error");
  const radios = ASSUMPTIONS.map((a) => {
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
  return h(
    "section",
    { class: "panel" },
    h("h2", null, "Training simulator"),
    h("p", { class: "hint" }, "Runs the same battle many times with your current design. The simulator is only as right as its assumptions."),
    h("div", { class: "radios" }, radios),
    custom,
    h(
      "div",
      { class: "row wrap" },
      h("label", null, "Battles ", numInput(sim.battles, (v) => commit((st) => (st.sim.battles = Math.max(50, Math.min(200000, Math.round(v))))), { step: 500, width: "6em" })),
      h("label", null, "Seed ", numInput(sim.seed, (v) => commit((st) => (st.sim.seed = Math.abs(Math.round(v)) >>> 0)), { step: 1, width: "7em" })),
      h("button", { class: "small", title: "New random seed", onClick: () => commit((st) => (st.sim.seed = randomSeed())) }, "🎲"),
    ),
    h("p", { class: "dim small" }, `${sim.battles} battles × ${sc.formations} formations = ${(sim.battles * sc.formations).toLocaleString()} formations`),
    issues.length ? h("p", { class: "error" }, "✖ The design has errors. Fix them in Setup first.") : null,
    h(
      "div",
      { class: "row" },
      h("button", { class: "primary", disabled: running || issues.length > 0, onClick: () => runCurrent() }, running ? "Simulating…" : "Run simulation"),
      running ? h("div", { class: "meter" }, h("div", { class: "meter-fill", style: `width:${progress * 100}%` })) : null,
    ),
    error ? h("p", { class: "error" }, error) : null,
  );
}

async function runCurrent() {
  const sc = state.scenario;
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
  if (!last) return h("section", { class: "panel" }, h("h2", null, "Results"), h("p", { class: "dim" }, "Run the simulator to see how often each goal is met."));
  const r = last.result;
  const ts = targets(sc);
  if (r.targetFall.length !== ts.length || r.classStop.length !== sc.classes.length)
    return h("section", { class: "panel" }, h("h2", null, "Results"), h("p", { class: "dim" }, "The scenario has changed since the last run. Run the simulator again."));
  const nf = r.battles * r.formations;
  return h(
    "section",
    { class: "panel" },
    h("h2", null, "Results ", h("span", { class: "dim small" }, `— ${last.label}, ${r.battles} battles`)),
    h("h3", null, "Goals met (share of battles)"),
    sc.classes.map((k, i) =>
      bar({ label: `${k.name}${k.primary ? " ★" : ""}`, sub: `stop ≥ ${pct(k.goal)}`, value: r.goalMet[i], n: r.battles }),
    ),
    bar({ label: h("strong", null, "All primary goals"), value: r.allPrimary, n: r.battles }),
    h("h3", null, "Ships stopped (share of formations)"),
    sc.classes.map((k, i) => bar({ label: k.name, value: r.classStop[i], n: nf, marker: k.goal, markerLabel: "goal", sense: "good" })),
    h("h3", null, "Targets falling (share of formations)"),
    ts.map((t) => bar({ label: t.label, value: r.targetFall[t.index], n: nf })),
    h("h3", null, "Side effects"),
    bar({ label: "Drones stranded", sub: "mean share of swarm per formation", value: r.stranded, n: nf }),
    r.falseKill === null
      ? h("p", { class: "dim" }, "False kills: none possible, no target is immune under these assumptions.")
      : bar({ label: "False kills", sub: "formations with ≥ 1", value: r.falseKill, n: nf, marker: sc.alpha, markerLabel: "Command limit", sense: "bad", max: Math.max(0.1, sc.alpha * 3) }),
    h("p", { class: "hint" }, "Whiskers show 95% Monte Carlo intervals. The tick on each bar is the goal (or Command's limit for false kills)."),
  );
}

function comparePanel() {
  const saved = state.saved;
  return h(
    "section",
    { class: "panel" },
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
                    onChange: (e: Event) => ((e.target as HTMLInputElement).checked ? unchecked.delete(sd.id) : unchecked.add(sd.id)),
                  }),
                  ` ${sd.design.name}`,
                ),
              ),
            ),
          ),
          h("p", { class: "dim small" }, "The current design is always included."),
          h("button", { disabled: running, onClick: () => runComparison() }, "Compare under these assumptions"),
        ),
  );
}

async function runComparison() {
  const sc = state.scenario;
  const designs: Design[] = [state.design, ...state.saved.filter((sd) => !unchecked.has(sd.id)).map((sd) => sd.design)];
  const valid = designs.filter((d) => validateDesign(sc, d).every((i) => i.level !== "error"));
  if (!valid.length) return;
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
  if (c.results.some((r) => r.goalMet.length !== sc.classes.length)) return null;
  const n = c.results[0].battles;
  const nf = n * c.results[0].formations;
  const cell = (v: number, nn: number, best: boolean) => h("td", { class: best ? "best" : "" }, pct(v, 1), h("span", { class: "dim small" }, ` ±${(1.96 * mcse(v, nn) * 100).toFixed(1)}`));
  const row = (label: string, vals: number[], nn: number, higherBetter = true) => {
    const best = higherBetter ? Math.max(...vals) : Math.min(...vals);
    return h("tr", null, h("th", null, label), vals.map((v) => cell(v, nn, vals.length > 1 && v === best)));
  };
  const rows = [
    row("All primary goals", c.results.map((r) => r.allPrimary), n),
    ...sc.classes.map((k, i) => row(`Goal: ${k.name} ≥ ${pct(k.goal)}`, c.results.map((r) => r.goalMet[i]), n)),
    ...sc.classes.map((k, i) => row(`Stopped: ${k.name}`, c.results.map((r) => r.classStop[i]), nf)),
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
  );
}
