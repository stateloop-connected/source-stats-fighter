import { designArrays, targets, type Design, type Scenario } from "./model";
import { NODE_R, nodePos, routeGeometry } from "./geometry";
import { DATA_VERSION, checkDesign, checkScenario, upgrade } from "./migrate";

export interface SaveFile {
  format: "alpha-wars-89";
  version: number;
  scenario: Scenario;
  design: Design;
}

export function toJSON(s: Scenario, d: Design): string {
  const f: SaveFile = { format: "alpha-wars-89", version: DATA_VERSION, scenario: s, design: d };
  return JSON.stringify(f, null, 2);
}

export function fromJSON(text: string): SaveFile & { notes: string[] } {
  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("This file is not valid JSON.");
  }
  if (!raw || raw.format !== "alpha-wars-89") throw new Error("This is not an Alpha Wars ’89 file.");
  const notes = upgrade(raw.version);
  const scenario = checkScenario(raw.scenario);
  const design = checkDesign(raw.design);
  return { format: "alpha-wars-89", version: DATA_VERSION, scenario, design, notes };
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
  const { w } = designArrays(s, d);
  const idx = new Map(ts.map((t) => [t.key, t]));
  // same layout as the editor: 50 px = 1 cm, y pointing down
  const cm = (v: number) => fmt(Math.round((v / 50) * 100) / 100);
  const P = (p: { x: number; y: number }) => `(${cm(p.x)}, ${cm(-p.y)})`;
  const lines: string[] = [];
  lines.push(`% Alpha Wars ’89 — design "${texEsc(d.name)}" for scenario "${texEsc(s.name)}"`);
  lines.push(`% One node per target (cannon vs ship class) with its initial weight; edges carry transition weights.`);
  lines.push(`% Ship classes are rows and cannons are columns, as in the game's editor.`);
  lines.push(`% requires \\usetikzlibrary{arrows.meta}`);
  lines.push(`\\begin{tikzpicture}[`);
  lines.push(`  hyp/.style={circle, draw, thick, minimum size=${fmt((2 * NODE_R) / 50)}cm, inner sep=1pt, align=center, font=\\scriptsize},`);
  lines.push(`  edge/.style={-{Stealth}, thick},`);
  lines.push(`  lbl/.style={fill=white, inner sep=1pt, font=\\scriptsize}]`);
  ts.forEach((t, i) => {
    lines.push(`  \\node[hyp] (H${i + 1}) at ${P(nodePos(t.c, t.k))} {${texEsc(t.cannon.name)}\\\\${texEsc(t.cls.name)}\\\\$${fmt(w[i])}$};`);
  });
  for (const r of d.routes) {
    const a = idx.get(r.from);
    const b = idx.get(r.to);
    if (!a || !b || !(r.share > 0)) continue;
    const g = routeGeometry(a, b, r);
    // the editor's quadratic curve written as a cubic: controls 2/3 of the way to the quadratic control point
    const c1 = { x: g.p0.x + (2 / 3) * (g.c.x - g.p0.x), y: g.p0.y + (2 / 3) * (g.c.y - g.p0.y) };
    const c2 = { x: g.p2.x + (2 / 3) * (g.c.x - g.p2.x), y: g.p2.y + (2 / 3) * (g.c.y - g.p2.y) };
    lines.push(`  \\draw[edge] ${P(g.p0)} .. controls ${P(c1)} and ${P(c2)} .. ${P(g.p2)};`);
    lines.push(`  \\node[lbl] at ${P(g.label)} {$${fmt(r.share)}$};`);
  }
  lines.push(`\\end{tikzpicture}`);
  return lines.join("\n") + "\n";
}
