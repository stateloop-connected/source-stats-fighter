import { h, numInput, download, newId, pct, add } from "./dom";
import { state, commit, cloneDesign, resetAll } from "./state";
import { renderNetwork, type Selection } from "./network";
import { GC, MAX_CANNONS, MAX_CLASSES, corrKey, energyUsed, targets, validateDesign, defaultScenario, type Design } from "../engine/model";
import { toJSON, fromJSON, toR, toTikZ } from "../engine/export";
import { shield } from "../engine/normal";

let selection: Selection = null;
let briefingOpen = true;
let exportFormat: "json" | "r" | "tikz" = "r";
let importMessage = "";

export function renderSetup(root: HTMLElement) {
  root.replaceChildren(
    briefing(),
    h(
      "div",
      { class: "setup-grid" },
      h("div", { class: "col-side" }, energyPanel(), presetsPanel(), validationPanel()),
      h("div", { class: "col-main" }, networkPanel()),
    ),
    h("div", { class: "setup-grid" }, h("div", { class: "col-side" }, savedPanel()), h("div", { class: "col-main" }, exportPanel())),
  );
}

/* ---------------- briefing / scenario ---------------- */

function briefing() {
  const sc = state.scenario;
  const det = h("details", { class: "panel", open: briefingOpen, onToggle: (e: Event) => (briefingOpen = (e.target as HTMLDetailsElement).open) });
  const hidden = sc.hideTruth;
  const ts = targets(sc);

  const general = h(
    "div",
    { class: "row wrap" },
    h("label", null, "Scenario ", h("input", { type: "text", value: sc.name, style: "width:16em", onChange: (e: Event) => commit((st) => (st.scenario.name = (e.target as HTMLInputElement).value)) })),
    h("label", null, "Formations ", numInput(sc.formations, (v) => commit((st) => (st.scenario.formations = Math.max(1, Math.min(500, Math.round(v))))), { min: 1, max: 500, step: 1, width: "4.5em" })),
    h("label", { title: "Size of the drone swarm (overall α)" }, "Swarm size ", numInput(sc.alpha, (v) => commit((st) => (st.scenario.alpha = Math.max(0.0001, Math.min(0.49, v)))), { scale: 100, step: 0.1, width: "4.5em" }), "%"),
    h("label", null, "Energy available ", numInput(sc.energyAvailable, (v) => commit((st) => (st.scenario.energyAvailable = Math.max(0, Math.round(v)))), { min: 0, step: 10, width: "5em" })),
    h(
      "label",
      { class: "switch", title: "Hide the true effects so the scenario can be played honestly" },
      h("input", { type: "checkbox", checked: hidden, onChange: (e: Event) => commit((st) => (st.scenario.hideTruth = (e.target as HTMLInputElement).checked)) }),
      " Classified (hide true effects)",
    ),
  );

  const cannons = h(
    "table",
    { class: "grid" },
    h("tr", null, h("th", null, "Cannon"), h("th", null, "Weapon"), h("th", null, "")),
    sc.cannons.map((c, ci) =>
      h(
        "tr",
        null,
        h("td", null, h("input", { type: "text", value: c.name, onChange: (e: Event) => commit((st) => (st.scenario.cannons[ci].name = (e.target as HTMLInputElement).value)) })),
        h("td", null, h("input", { type: "text", value: c.weapon, style: "width:7em", onChange: (e: Event) => commit((st) => (st.scenario.cannons[ci].weapon = (e.target as HTMLInputElement).value)) })),
        h("td", null, sc.cannons.length > 1 ? h("button", { class: "small", onClick: () => commit((st) => st.scenario.cannons.splice(ci, 1)) }, "remove") : null),
      ),
    ),
  );
  const addCannon =
    sc.cannons.length < MAX_CANNONS
      ? h("button", { class: "small", onClick: () => commit((st) => st.scenario.cannons.push({ id: newId("c"), name: `Cannon ${st.scenario.cannons.length + 1}`, weapon: "beam" })) }, "+ cannon")
      : null;

  const classes = h(
    "table",
    { class: "grid" },
    h("tr", null, h("th", null, "Ship class"), h("th", null, "Goal"), h("th", null, "Primary"), h("th", null, "")),
    sc.classes.map((k, ki) =>
      h(
        "tr",
        null,
        h("td", null, h("input", { type: "text", value: k.name, style: "width:8em", onChange: (e: Event) => commit((st) => (st.scenario.classes[ki].name = (e.target as HTMLInputElement).value)) })),
        h("td", null, numInput(k.goal, (v) => commit((st) => (st.scenario.classes[ki].goal = Math.max(0, Math.min(1, v)))), { scale: 100, step: 5, width: "4em" }), "%"),
        h("td", { class: "c" }, h("input", { type: "checkbox", checked: k.primary, onChange: (e: Event) => commit((st) => (st.scenario.classes[ki].primary = (e.target as HTMLInputElement).checked)) })),
        h("td", null, sc.classes.length > 1 ? h("button", { class: "small", onClick: () => commit((st) => st.scenario.classes.splice(ki, 1)) }, "remove") : null),
      ),
    ),
  );
  const addClass =
    sc.classes.length < MAX_CLASSES
      ? h("button", { class: "small", onClick: () => commit((st) => st.scenario.classes.push({ id: newId("k"), name: `Class ${st.scenario.classes.length + 1}`, goal: 0.5, primary: false })) }, "+ ship class")
      : null;

  const effects = h(
    "table",
    { class: "grid effects" },
    h("tr", null, h("th", null, "Effectiveness"), sc.classes.map((k) => h("th", null, k.name))),
    sc.cannons.map((c) =>
      h(
        "tr",
        null,
        h("th", null, c.name),
        sc.classes.map((k) => {
          const t = ts.find((x) => x.cannon.id === c.id && x.cls.id === k.id)!;
          const it = sc.intel[t.key];
          const set = (field: "guess" | "low" | "high") => (v: number) => commit((st) => (st.scenario.intel[t.key][field] = v));
          return h(
            "td",
            null,
            h(
              "div",
              { class: "intel" },
              h("span", { class: "lbl" }, "intel"),
              numInput(it.guess, set("guess"), { step: 0.05, width: "4.2em", title: "best guess" }),
              h("span", { class: "dim" }, " ("),
              numInput(it.low, set("low"), { step: 0.05, width: "4.2em", title: "low end" }),
              h("span", { class: "dim" }, "–"),
              numInput(it.high, set("high"), { step: 0.05, width: "4.2em", title: "high end" }),
              h("span", { class: "dim" }, ")"),
            ),
            h(
              "div",
              { class: "truth" },
              h("span", { class: "lbl" }, "true"),
              hidden ? h("span", { class: "classified" }, "CLASSIFIED") : numInput(sc.trueEffect[t.key], (v) => commit((st) => (st.scenario.trueEffect[t.key] = v)), { step: 0.05, width: "4.2em" }),
              !hidden && sc.trueEffect[t.key] <= 0 ? h("span", { class: "warn-text" }, " immune") : null,
            ),
          );
        }),
      ),
    ),
  );

  const corrRows: HTMLElement[] = [];
  for (let i = 0; i < sc.classes.length; i++)
    for (let j = i + 1; j < sc.classes.length; j++) {
      const key = corrKey(sc.classes[i].id, sc.classes[j].id);
      corrRows.push(
        h(
          "label",
          null,
          `${sc.classes[i].name} ~ ${sc.classes[j].name} `,
          numInput(sc.classCorrelation[key] ?? 0, (v) => commit((st) => (st.scenario.classCorrelation[key] = Math.max(-0.99, Math.min(0.99, v)))), { step: 0.1, width: "4em" }),
        ),
      );
    }

  add(
    det,
    h("summary", null, h("span", { class: "panel-title" }, "Briefing"), h("span", { class: "dim" }, ` — ${sc.name}: ${sc.cannons.length} cannon(s), ${sc.classes.length} ship class(es), ${sc.formations} formations`)),
    general,
    h("div", { class: "row wrap top" }, h("div", null, cannons, addCannon), h("div", null, classes, addClass)),
    h("p", { class: "hint" }, "Effectiveness is a standardised effect: the expected shot strength is effect × √information, where information = 1 / (1/cannon energy + 1/Ground Control energy). Zero means the class is immune."),
    effects,
    corrRows.length ? h("div", { class: "row wrap" }, h("span", { class: "dim" }, "Correlation between classes:"), corrRows) : null,
    h(
      "div",
      { class: "row" },
      h(
        "button",
        {
          class: "small",
          onClick: () => {
            if (confirm("Restore the default scenario? The current design is kept where it still fits.")) commit((st) => (st.scenario = defaultScenario()));
          },
        },
        "Restore default scenario",
      ),
      h(
        "button",
        {
          class: "small danger",
          onClick: () => {
            if (confirm("Reset everything, including saved designs?")) resetAll();
          },
        },
        "Reset everything",
      ),
    ),
  );
  return det;
}

/* ---------------- energy ---------------- */

function energyPanel() {
  const sc = state.scenario;
  const d = state.design;
  const used = energyUsed(sc, d);
  const totalLabel = h("span", null);
  const bar = h("div", { class: "meter-fill" });
  const updateTotal = () => {
    const u = energyUsed(state.scenario, state.design);
    totalLabel.textContent = `${u} / ${sc.energyAvailable}`;
    totalLabel.className = u > sc.energyAvailable ? "bad" : "";
    bar.style.width = `${Math.min(100, (u / Math.max(1, sc.energyAvailable)) * 100)}%`;
    bar.className = u > sc.energyAvailable ? "meter-fill over" : "meter-fill";
  };
  void used;
  const arms = [...sc.cannons.map((c) => ({ id: c.id, name: c.name })), { id: GC, name: "Ground Control" }];
  const rows = arms.map((a) => {
    const val = h("span", { class: "val" }, String(d.energy[a.id] ?? 0));
    const slider = h("input", {
      type: "range",
      min: 0,
      max: sc.energyAvailable,
      step: 5,
      value: String(d.energy[a.id] ?? 0),
      onInput: (e: Event) => {
        const v = parseInt((e.target as HTMLInputElement).value, 10);
        commit((st) => (st.design.energy[a.id] = v), true);
        val.textContent = String(v);
        updateTotal();
        redrawNetwork();
      },
      onChange: () => commit(() => {}),
    });
    return h("div", { class: "energy-row" }, h("span", { class: "name" }, a.name), slider, val);
  });
  updateTotal();
  return h(
    "section",
    { class: "panel" },
    h("h2", null, "Energy"),
    rows,
    h("div", { class: "row" }, h("span", { class: "dim" }, "Used"), h("div", { class: "meter" }, bar), totalLabel),
    h("p", { class: "hint" }, "More energy makes shots stronger. Ground Control is shared: a cannon is only as good as its tracking."),
  );
}

/* ---------------- presets ---------------- */

function presetsPanel() {
  const apply = (fn: (d: Design) => void, name?: string) =>
    commit((st) => {
      fn(st.design);
      if (name) st.design.name = name;
      selection = null;
    });
  const keys = () => targets(state.scenario).map((t) => t.key);
  return h(
    "section",
    { class: "panel" },
    h("h2", null, "Presets"),
    h(
      "div",
      { class: "row wrap" },
      h(
        "button",
        {
          title: "Spread the swarm equally, no wormholes",
          onClick: () =>
            apply((d) => {
              const ks = keys();
              d.weights = Object.fromEntries(ks.map((k) => [k, 1 / ks.length]));
              d.routes = [];
            }, "Equal split"),
        },
        "Equal split",
      ),
      h(
        "button",
        {
          title: "All drones on the most promising target according to intelligence, then one target after another",
          onClick: () =>
            apply((d) => {
              const sc = state.scenario;
              const ks = keys().sort((a, b) => (sc.intel[b]?.guess ?? 0) - (sc.intel[a]?.guess ?? 0));
              d.weights = Object.fromEntries(ks.map((k, i) => [k, i === 0 ? 1 : 0]));
              d.routes = ks.slice(0, -1).map((k, i) => ({ from: k, to: ks[i + 1], share: 1 }));
            }, "Strict sequence"),
        },
        "Strict sequence",
      ),
      h(
        "button",
        {
          title: "Equal split, and every target passes its drones equally to all others (Holm)",
          onClick: () =>
            apply((d) => {
              const ks = keys();
              const m = ks.length;
              d.weights = Object.fromEntries(ks.map((k) => [k, 1 / m]));
              d.routes = m > 1 ? ks.flatMap((a) => ks.filter((b) => b !== a).map((b) => ({ from: a, to: b, share: 1 / (m - 1) }))) : [];
            }, "Holm"),
        },
        "Holm",
      ),
      h(
        "button",
        {
          class: "small",
          onClick: () =>
            apply((d) => {
              d.routes = [];
            }),
        },
        "Clear wormholes",
      ),
    ),
    h("p", { class: "hint" }, "Strict sequence orders targets by the intelligence best guess."),
  );
}

/* ---------------- validation ---------------- */

function validationPanel() {
  const issues = validateDesign(state.scenario, state.design);
  return h(
    "section",
    { class: "panel" },
    h("h2", null, "Status"),
    issues.length === 0
      ? h("p", { class: "ok" }, "✔ Design is ready for battle.")
      : h(
          "ul",
          { class: "issues" },
          issues.map((i) => h("li", { class: i.level }, i.level === "error" ? "✖ " : "⚠ ", i.message)),
        ),
  );
}

/* ---------------- network ---------------- */

let svgEl: SVGSVGElement | null = null;

function redrawNetwork() {
  if (!svgEl) return;
  renderNetwork(svgEl, state.scenario, state.design, selection, {
    select: (sel) => {
      selection = sel;
      commit(() => {});
    },
    addRoute: (from, to) => {
      commit((st) => {
        const d = st.design;
        const existing = d.routes.findIndex((r) => r.from === from && r.to === to);
        if (existing >= 0) {
          selection = { kind: "route", index: existing };
          return;
        }
        const out = d.routes.filter((r) => r.from === from).reduce((s, r) => s + r.share, 0);
        d.routes.push({ from, to, share: Math.max(0, Math.round((1 - out) * 1000) / 1000) });
        selection = { kind: "route", index: d.routes.length - 1 };
      });
    },
  });
}

function networkPanel() {
  svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
  svgEl.classList.add("network");
  redrawNetwork();
  return h(
    "section",
    { class: "panel" },
    h("h2", null, "Drones & wormholes"),
    h("p", { class: "hint" }, "Click a target to set its share of the swarm. Drag from one target to another to open a wormhole; click a wormhole to set the share of drones that take it. The ring shows each target's drones; fewer drones mean a stronger shield."),
    svgEl,
    inspector(),
  );
}

function inspector() {
  const sc = state.scenario;
  const d = state.design;
  const ts = targets(sc);
  const label = (key: string) => ts.find((t) => t.key === key)?.label ?? key;
  const box = h("div", { class: "inspector" });
  if (!selection) {
    const total = Object.values(d.weights).reduce((a, b) => a + b, 0);
    box.append(h("p", { class: "dim" }, `Swarm assigned: ${pct(total, 1)}. Select a target or wormhole to edit it.`));
    return box;
  }
  if (selection.kind === "route") {
    const i = selection.index;
    const r = d.routes[i];
    if (!r) return box;
    box.append(
      h("h3", null, `Wormhole: ${label(r.from)} → ${label(r.to)}`),
      h(
        "div",
        { class: "row" },
        h("label", null, "Share of released drones ", numInput(r.share, (v) => commit((st) => (st.design.routes[i].share = Math.max(0, Math.min(1, v)))), { scale: 100, step: 5, width: "5em" }), "%"),
        h(
          "button",
          {
            class: "small danger",
            onClick: () =>
              commit((st) => {
                st.design.routes.splice(i, 1);
                selection = null;
              }),
          },
          "Close wormhole",
        ),
        h("button", { class: "small", onClick: () => ((selection = { kind: "node", key: r.from }), commit(() => {})) }, "Select source"),
      ),
    );
    return box;
  }
  const key = selection.key;
  const t = ts.find((x) => x.key === key);
  if (!t) return box;
  const w = d.weights[key] ?? 0;
  const total = Object.values(d.weights).reduce((a, b) => a + b, 0);
  const intel = sc.intel[key];
  const outs = d.routes.map((r, i) => ({ r, i })).filter(({ r }) => r.from === key);
  const ins = d.routes.filter((r) => r.to === key);
  const outTotal = outs.reduce((s, { r }) => s + r.share, 0);
  add(
    box,
    h("h3", null, t.label),
    h(
      "p",
      { class: "dim" },
      `Intel: ${intel.guess} (range ${intel.low}–${intel.high})`,
      sc.hideTruth ? "" : ` · true: ${sc.trueEffect[key]}`,
      ` · shield now ${shield(w, sc.alpha).toFixed(2)}`,
    ),
    h(
      "div",
      { class: "row" },
      h("label", null, "Initial drones ", numInput(w, (v) => commit((st) => (st.design.weights[key] = Math.max(0, Math.min(1, v)))), { scale: 100, step: 5, width: "5em" }), "%"),
      total < 1 - 1e-9 ? h("button", { class: "small", onClick: () => commit((st) => (st.design.weights[key] = (st.design.weights[key] ?? 0) + (1 - total))) }, `+ unassigned ${pct(1 - total, 1)}`) : null,
      w > 0 ? h("button", { class: "small", onClick: () => commit((st) => (st.design.weights[key] = 0)) }, "None") : null,
    ),
    h("h4", null, `Wormholes out (${pct(outTotal, 1)} of released drones)`),
    outs.length
      ? h(
          "ul",
          { class: "routes" },
          outs.map(({ r, i }) =>
            h(
              "li",
              null,
              `→ ${label(r.to)} `,
              numInput(r.share, (v) => commit((st) => (st.design.routes[i].share = Math.max(0, Math.min(1, v)))), { scale: 100, step: 5, width: "4.5em" }),
              "% ",
              h("button", { class: "small", onClick: () => commit((st) => st.design.routes.splice(i, 1)) }, "✕"),
            ),
          ),
        )
      : h("p", { class: "dim" }, "None. When this target falls, its drones are lost. Drag from it to another target to add a route."),
    outs.length && outTotal < 1 - 1e-9 ? h("p", { class: "warn-text" }, `${pct(1 - outTotal, 1)} of this target's drones will be lost when it falls.`) : null,
    ins.length ? h("p", { class: "dim" }, `Receives drones from: ${ins.map((r) => `${label(r.from)} (${pct(r.share)})`).join(", ")}`) : null,
  );
  return box;
}

/* ---------------- saved designs ---------------- */

function savedPanel() {
  const sc = state.scenario;
  return h(
    "section",
    { class: "panel" },
    h("h2", null, "Designs"),
    h(
      "div",
      { class: "row" },
      h("label", null, "Name ", h("input", { type: "text", value: state.design.name, style: "width:11em", onChange: (e: Event) => commit((st) => (st.design.name = (e.target as HTMLInputElement).value)) })),
      h(
        "button",
        {
          onClick: () =>
            commit((st) => {
              const existing = st.saved.find((x) => x.design.name === st.design.name);
              if (existing) {
                existing.design = cloneDesign(st.design);
                existing.savedAt = Date.now();
              } else st.saved.push({ id: newId("d"), design: cloneDesign(st.design), savedAt: Date.now() });
            }),
        },
        "Save",
      ),
    ),
    state.saved.length
      ? h(
          "ul",
          { class: "saved" },
          state.saved.map((sd, i) =>
            h(
              "li",
              null,
              h("span", { class: "name" }, sd.design.name),
              h("span", { class: "dim" }, ` energy ${energyUsed(sc, sd.design)}`),
              h("button", { class: "small", onClick: () => commit((st) => ((st.design = cloneDesign(sd.design)), (selection = null))) }, "Load"),
              h("button", { class: "small danger", onClick: () => commit((st) => st.saved.splice(i, 1)) }, "✕"),
            ),
          ),
        )
      : h("p", { class: "dim" }, "No saved designs yet. Saved designs can be compared in the Simulation tab."),
  );
}

/* ---------------- export / import ---------------- */

function exportPanel() {
  const sc = state.scenario;
  const d = state.design;
  const text = exportFormat === "json" ? toJSON(sc, d) : exportFormat === "r" ? toR(sc, d) : toTikZ(sc, d);
  const ext = exportFormat === "json" ? "json" : exportFormat === "r" ? "R" : "tex";
  const fname = `${(d.name || "design").replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}.${ext}`;
  const tab = (f: typeof exportFormat, label: string) =>
    h(
      "button",
      {
        class: `small${exportFormat === f ? " active" : ""}`,
        onClick: () => {
          exportFormat = f;
          commit(() => {});
        },
      },
      label,
    );
  const fileInput = h("input", {
    type: "file",
    accept: ".json,application/json",
    style: "display:none",
    onChange: async (e: Event) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (!f) return;
      try {
        const data = fromJSON(await f.text());
        commit((st) => {
          st.scenario = data.scenario;
          st.design = data.design;
          selection = null;
        });
        importMessage = `Loaded “${data.design.name}” for “${data.scenario.name}”.`;
      } catch (err) {
        importMessage = (err as Error).message;
      }
      commit(() => {});
    },
  }) as HTMLInputElement;
  return h(
    "section",
    { class: "panel" },
    h("h2", null, "Export & import"),
    h(
      "div",
      { class: "row wrap" },
      tab("r", "R (gMCP / graphicalMCP)"),
      tab("tikz", "LaTeX (TikZ)"),
      tab("json", "JSON"),
      h("span", { class: "spacer" }),
      h("button", { class: "small", onClick: () => navigator.clipboard?.writeText(text) }, "Copy"),
      h("button", { class: "small", onClick: () => download(fname, text) }, "Download"),
      h("button", { class: "small", onClick: () => fileInput.click() }, "Import JSON…"),
      fileInput,
    ),
    importMessage ? h("p", { class: "hint" }, importMessage) : null,
    h("pre", { class: "code" }, text),
  );
}
