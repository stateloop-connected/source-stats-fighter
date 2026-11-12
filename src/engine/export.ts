import { designArrays, targets, type Design, type Scenario } from "./model";

export interface SaveFile {
  format: "alpha-wars-89";
  version: 1;
  scenario: Scenario;
  design: Design;
}

export function toJSON(s: Scenario, d: Design): string {
  const f: SaveFile = { format: "alpha-wars-89", version: 1, scenario: s, design: d };
  return JSON.stringify(f, null, 2);
}

export function fromJSON(text: string): SaveFile {
  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("This file is not valid JSON.");
  }
  if (!raw || raw.format !== "alpha-wars-89") throw new Error("This is not an Alpha Wars ’89 file.");
  const s = raw.scenario;
  const d = raw.design;
  const isObj = (x: any) => x && typeof x === "object";
  if (!isObj(s) || !Array.isArray(s.cannons) || !Array.isArray(s.classes) || !isObj(s.trueEffect) || !isObj(s.intel))
    throw new Error("The scenario in this file is incomplete.");
  if (!isObj(d) || !isObj(d.energy) || !isObj(d.weights) || !Array.isArray(d.routes)) throw new Error("The design in this file is incomplete.");
  return raw as SaveFile;
}

export function fmt(x: number): string {
  if (Number.isInteger(x)) return String(x);
  return String(Math.round(x * 1e6) / 1e6);
}

const rName = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "H";

function hypNames(s: Scenario): string[] {
  const names = targets(s).map((t) => `${rName(t.cannon.name)}.${rName(t.cls.name)}`);
  // make unique
  const seen = new Map<string, number>();
  return names.map((n) => {
    const c = seen.get(n) ?? 0;
    seen.set(n, c + 1);
    return c ? `${n}.${c + 1}` : n;
  });
}

export function toR(s: Scenario, d: Design): string {
  const ts = targets(s);
  const { w, G } = designArrays(s, d);
  const names = hypNames(s);
  const m = ts.length;
  const lines: string[] = [];
  lines.push(`# Alpha Wars ’89 — design "${d.name}" for scenario "${s.name}"`);
  lines.push(`# One hypothesis per target (cannon vs ship class):`);
  ts.forEach((t, i) => lines.push(`#   ${names[i]} = ${t.label}`));
  lines.push(`alpha <- ${fmt(s.alpha)}`);
  lines.push(`hyp <- c(${names.map((n) => `"${n}"`).join(", ")})`);
  lines.push(`weights <- setNames(c(${w.map(fmt).join(", ")}), hyp)`);
  lines.push(`m <- matrix(c(`);
  G.forEach((row, i) => lines.push(`  ${row.map(fmt).join(", ")}${i < m - 1 ? "," : ""}`));
  lines.push(`), nrow = ${m}, byrow = TRUE, dimnames = list(hyp, hyp))`);
  lines.push(``);
  lines.push(`# p <- c(...)  # one-sided p-values, in the order of hyp`);
  lines.push(``);
  lines.push(`## gMCP`);
  lines.push(`library(gMCP)`);
  lines.push(`graph <- matrix2graph(m, weights)`);
  lines.push(`# gMCP(graph, pvalues = p, alpha = alpha)`);
  lines.push(``);
  lines.push(`## graphicalMCP`);
  lines.push(`library(graphicalMCP)`);
  lines.push(`g <- graph_create(weights, m)`);
  lines.push(`# graph_test_shortcut(g, p = p, alpha = alpha)`);
  return lines.join("\n") + "\n";
}

const texEsc = (s: string) => s.replace(/([\\{}$&#^_%~])/g, "\\$1");

export function toTikZ(s: Scenario, d: Design): string {
  const ts = targets(s);
  const { w, G } = designArrays(s, d);
  const lines: string[] = [];
  lines.push(`% Alpha Wars ’89 — design "${texEsc(d.name)}"`);
  lines.push(`% requires \\usetikzlibrary{arrows.meta}`);
  lines.push(`\\begin{tikzpicture}[`);
  lines.push(`  hyp/.style={circle, draw, thick, minimum size=2cm, align=center, font=\\footnotesize},`);
  lines.push(`  edge/.style={-{Stealth}, thick, bend left=15},`);
  lines.push(`  lbl/.style={fill=white, inner sep=1pt, font=\\scriptsize}]`);
  ts.forEach((t, i) => {
    lines.push(`  \\node[hyp] (H${i + 1}) at (${t.k * 3.2}, ${-t.c * 3.2}) {${texEsc(t.cannon.name)}\\\\${texEsc(t.cls.name)}\\\\$${fmt(w[i])}$};`);
  });
  G.forEach((row, i) =>
    row.forEach((g, j) => {
      if (g > 0) lines.push(`  \\draw[edge] (H${i + 1}) to node[lbl] {$${fmt(g)}$} (H${j + 1});`);
    }),
  );
  lines.push(`\\end{tikzpicture}`);
  return lines.join("\n") + "\n";
}
