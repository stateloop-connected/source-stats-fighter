import { s, num } from "./dom";
import { information, targets, type Design, type Scenario } from "../engine/model";
import { shield } from "../engine/normal";

export type Selection = { kind: "node"; key: string } | { kind: "route"; index: number } | null;

export interface NetworkCallbacks {
  select(sel: Selection): void;
  addRoute(from: string, to: string): void;
}

const R = 40;
const COL = 180;
const ROW = 150;
const LEFT = 200;
const TOP = 70;

export function nodePos(c: number, k: number) {
  return { x: LEFT + k * COL, y: TOP + c * ROW };
}

/** Quadratic curve between two node centres, bowed to the right of the direction of travel. */
export function curve(a: { x: number; y: number }, b: { x: number; y: number }, r = R, bow = 0.3) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 1;
  const nx = -dy / d;
  const ny = dx / d;
  const off = d * bow + 12;
  const cx = (a.x + b.x) / 2 + nx * off;
  const cy = (a.y + b.y) / 2 + ny * off;
  const trim = (p: { x: number; y: number }) => {
    const vx = cx - p.x;
    const vy = cy - p.y;
    const l = Math.hypot(vx, vy) || 1;
    return { x: p.x + (vx / l) * r, y: p.y + (vy / l) * r };
  };
  const p0 = trim(a);
  const p2 = trim(b);
  const mid = { x: 0.25 * p0.x + 0.5 * cx + 0.25 * p2.x, y: 0.25 * p0.y + 0.5 * cy + 0.25 * p2.y };
  return { p0, c: { x: cx, y: cy }, p2, mid };
}

export function renderNetwork(svg: SVGSVGElement, sc: Scenario, d: Design, sel: Selection, cb: NetworkCallbacks) {
  const ts = targets(sc);
  const K = sc.classes.length;
  const C = sc.cannons.length;
  const W = LEFT + (K - 1) * COL + 110;
  const H = TOP + (C - 1) * ROW + 80;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.replaceChildren();
  const pos = new Map(ts.map((t) => [t.key, nodePos(t.c, t.k)]));

  svg.append(
    s(
      "defs",
      null,
      s("marker", { id: "arrow", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, s("path", { d: "M0,0 L10,5 L0,10 z", fill: "var(--wormhole)" })),
      s("marker", { id: "arrow-sel", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, s("path", { d: "M0,0 L10,5 L0,10 z", fill: "var(--accent)" })),
    ),
  );

  // headers
  sc.classes.forEach((cls, k) => {
    const p = nodePos(0, k);
    svg.append(s("text", { x: p.x, y: 22, class: "net-head", "text-anchor": "middle" }, `${cls.name}${cls.primary ? " ★" : ""}`));
  });
  sc.cannons.forEach((can, c) => {
    const p = nodePos(c, 0);
    const n = d.energy[can.id] ?? 0;
    svg.append(s("text", { x: 14, y: p.y - 4, class: "net-head" }, can.name));
    svg.append(s("text", { x: 14, y: p.y + 14, class: "net-sub" }, `energy ${n}`));
  });

  // routes
  const routeLayer = s("g");
  d.routes.forEach((r, i) => {
    const a = pos.get(r.from);
    const b = pos.get(r.to);
    if (!a || !b) return;
    const cv = curve(a, b);
    const selected = sel?.kind === "route" && sel.index === i;
    const pathD = `M${cv.p0.x},${cv.p0.y} Q${cv.c.x},${cv.c.y} ${cv.p2.x},${cv.p2.y}`;
    const pick = () => cb.select({ kind: "route", index: i });
    routeLayer.append(
      s("path", { d: pathD, class: "route-hit", onPointerdown: (e: Event) => e.stopPropagation(), onClick: pick }),
      s("path", { d: pathD, class: selected ? "route sel" : "route", "marker-end": selected ? "url(#arrow-sel)" : "url(#arrow)" }),
      s(
        "g",
        { class: "route-label", onPointerdown: (e: Event) => e.stopPropagation(), onClick: pick },
        s("rect", { x: cv.mid.x - 22, y: cv.mid.y - 10, width: 44, height: 20, rx: 4, class: selected ? "sel" : "" }),
        s("text", { x: cv.mid.x, y: cv.mid.y + 4, "text-anchor": "middle" }, `${Math.round(r.share * 1000) / 10}%`),
      ),
    );
  });

  // nodes
  const nodeLayer = s("g");
  const gcE = d.energy.gc ?? 0;
  for (const t of ts) {
    const p = pos.get(t.key)!;
    const w = d.weights[t.key] ?? 0;
    const sh = shield(w, sc.alpha);
    const intel = sc.intel[t.key]?.guess ?? 0;
    const shot = intel * Math.sqrt(information(d.energy[t.cannon.id] ?? 0, gcE));
    const selected = sel?.kind === "node" && sel.key === t.key;
    const circ = 2 * Math.PI * (R + 5);
    const g = s(
      "g",
      { class: `node${selected ? " sel" : ""}${w > 0 ? " armed" : ""}`, "data-key": t.key, transform: `translate(${p.x},${p.y})` },
      s("circle", { r: R, class: "node-body" }),
      s("circle", { r: R + 5, class: "node-ring-bg" }),
      w > 0 ? s("circle", { r: R + 5, class: "node-ring", "stroke-dasharray": `${circ * Math.min(1, w)} ${circ}`, transform: "rotate(-90)" }) : null,
      s("text", { y: -8, class: "node-share", "text-anchor": "middle" }, `${Math.round(w * 1000) / 10}%`),
      s("text", { y: 9, class: "node-small", "text-anchor": "middle" }, `shield ${num(sh)}`),
      s("text", { y: 23, class: "node-small dim", "text-anchor": "middle" }, `shot≈${num(shot, 1)}`),
    );
    nodeLayer.append(g);
  }

  const temp = s("path", { class: "route temp", d: "" }) as SVGPathElement;
  svg.append(routeLayer, nodeLayer, temp);

  // interaction
  const toSvg = (e: PointerEvent) => {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const m = svg.getScreenCTM();
    return m ? pt.matrixTransform(m.inverse()) : pt;
  };
  const hit = (x: number, y: number) => {
    for (const [key, p] of pos) if (Math.hypot(p.x - x, p.y - y) <= R + 6) return key;
    return null;
  };
  let drag: { from: string; x: number; y: number; moved: boolean } | null = null;
  svg.onpointerdown = (e) => {
    const p = toSvg(e);
    const key = hit(p.x, p.y);
    if (!key) {
      drag = null;
      if (sel) cb.select(null);
      return;
    }
    drag = { from: key, x: p.x, y: p.y, moved: false };
    svg.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  svg.onpointermove = (e) => {
    if (!drag) return;
    const p = toSvg(e);
    if (Math.hypot(p.x - drag.x, p.y - drag.y) > 8) drag.moved = true;
    if (drag.moved) {
      const a = pos.get(drag.from)!;
      temp.setAttribute("d", `M${a.x},${a.y} L${p.x},${p.y}`);
    }
  };
  svg.onpointerup = (e) => {
    if (!drag) return;
    const p = toSvg(e);
    const target = hit(p.x, p.y);
    const from = drag.from;
    const moved = drag.moved;
    drag = null;
    temp.setAttribute("d", "");
    if (moved && target && target !== from) cb.addRoute(from, target);
    else if (!moved) cb.select({ kind: "node", key: from });
  };
}
