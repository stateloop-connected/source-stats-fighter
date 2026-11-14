import { s, num } from "./dom";
import { information, targets, type Design, type Scenario } from "../engine/model";
import { shield } from "../engine/normal";
import { COL, LEFT, NODE_R as R, ROW, TOP, edgeGeometry, nodePos, routeGeometry, type Pt } from "../engine/geometry";

export type Selection = { kind: "node"; key: string } | { kind: "route"; index: number } | null;

export interface NetworkCallbacks {
  select(sel: Selection): void;
  addRoute(from: string, to: string): void;
  /** Whether dragging between targets opens a wormhole. */
  allowRoutes?: boolean;
  /** Move a route's share label (null resets it). */
  moveLabel(index: number, offset: Pt | null): void;
}

/** Quadratic curve between two node centres (used by the battle screen). */
export function curve(a: Pt, b: Pt, r = R, bow = 0.3) {
  const g = edgeGeometry(a, b, null, r, bow);
  return { p0: g.p0, c: g.c, p2: g.p2, mid: g.label };
}

const pathOf = (g: { p0: Pt; c: Pt; p2: Pt }) => `M${g.p0.x},${g.p0.y} Q${g.c.x},${g.c.y} ${g.p2.x},${g.p2.y}`;

export function renderNetwork(svg: SVGSVGElement, sc: Scenario, d: Design, sel: Selection, cb: NetworkCallbacks) {
  const ts = targets(sc);
  const K = sc.classes.length;
  const C = sc.cannons.length;
  const W = LEFT + (C - 1) * COL + 120;
  const H = TOP + (K - 1) * ROW + 70;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.style.maxWidth = `${W * 1.25}px`;
  svg.replaceChildren();
  const pos = new Map(ts.map((t) => [t.key, nodePos(t.c, t.k)]));
  const cell = new Map(ts.map((t) => [t.key, { c: t.c, k: t.k }]));

  svg.append(
    s(
      "defs",
      null,
      s("marker", { id: "arrow", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, s("path", { d: "M0,0 L10,5 L0,10 z", fill: "var(--wormhole)" })),
      s("marker", { id: "arrow-sel", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, s("path", { d: "M0,0 L10,5 L0,10 z", fill: "var(--accent)" })),
    ),
  );

  // headers: cannons across the top, ship classes down the side
  sc.cannons.forEach((can, c) => {
    const p = nodePos(c, 0);
    svg.append(
      s("text", { x: p.x, y: 18, class: "net-head", "text-anchor": "middle" }, can.name),
      s("text", { x: p.x, y: 33, class: "net-sub", "text-anchor": "middle" }, `energy ${d.energy[can.id] ?? 0}`),
    );
  });
  sc.classes.forEach((cls, k) => {
    const p = nodePos(0, k);
    svg.append(
      s("text", { x: 12, y: p.y - 4, class: "net-head" }, `${cls.name}${cls.primary ? " ★" : ""}`),
      s("text", { x: 12, y: p.y + 13, class: "net-sub" }, `goal ${Math.round(cls.goal * 100)}%`),
    );
  });

  // routes
  const routeLayer = s("g");
  const labelLayer = s("g");
  d.routes.forEach((r, i) => {
    const a = cell.get(r.from);
    const b = cell.get(r.to);
    if (!a || !b) return;
    const g = routeGeometry(a, b, r);
    const selected = sel?.kind === "route" && sel.index === i;
    const hitPath = s("path", { d: pathOf(g), class: "route-hit", onPointerdown: (e: Event) => e.stopPropagation(), onClick: () => cb.select({ kind: "route", index: i }) });
    const linePath = s("path", { d: pathOf(g), class: selected ? "route sel" : "route", "marker-end": selected ? "url(#arrow-sel)" : "url(#arrow)" });
    const rect = s("rect", { x: g.label.x - 22, y: g.label.y - 10, width: 44, height: 20, rx: 4, class: selected ? "sel" : "" });
    const text = s("text", { x: g.label.x, y: g.label.y + 4, "text-anchor": "middle" }, `${Math.round(r.share * 1000) / 10}%`);
    const label = s("g", { class: "route-label", tabindex: -1 }, rect, text) as SVGGElement;
    routeLayer.append(hitPath, linePath);
    labelLayer.append(label);

    // drag the label to bend the edge; a click without movement selects the route
    let drag: { start: Pt; offset: Pt; moved: boolean } | null = null;
    label.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      e.preventDefault();
      const p = toSvg(e);
      drag = { start: p, offset: r.label ?? { x: 0, y: 0 }, moved: false };
      label.setPointerCapture(e.pointerId);
    });
    label.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const p = toSvg(e);
      const dx = p.x - drag.start.x;
      const dy = p.y - drag.start.y;
      if (Math.hypot(dx, dy) > 4) drag.moved = true;
      if (!drag.moved) return;
      const off = { x: drag.offset.x + dx, y: drag.offset.y + dy };
      const ng = edgeGeometry(nodePos(a.c, a.k), nodePos(b.c, b.k), off);
      hitPath.setAttribute("d", pathOf(ng));
      linePath.setAttribute("d", pathOf(ng));
      rect.setAttribute("x", String(ng.label.x - 22));
      rect.setAttribute("y", String(ng.label.y - 10));
      text.setAttribute("x", String(ng.label.x));
      text.setAttribute("y", String(ng.label.y + 4));
    });
    label.addEventListener("pointerup", (e) => {
      if (!drag) return;
      const p = toSvg(e);
      const moved = drag.moved;
      const off = { x: Math.round(drag.offset.x + p.x - drag.start.x), y: Math.round(drag.offset.y + p.y - drag.start.y) };
      drag = null;
      if (moved) cb.moveLabel(i, Math.hypot(off.x, off.y) < 6 ? null : off);
      else cb.select({ kind: "route", index: i });
    });
  });

  // nodes
  const nodeLayer = s("g");
  const gcE = d.energy.gc ?? 0;
  for (const t of ts) {
    const p = pos.get(t.key)!;
    const w = d.weights[t.key] ?? 0;
    const sh = shield(w, sc.alpha);
    const intel = sc.intel[t.key]?.guess ?? 0;
    const impact = intel * Math.sqrt(information(d.energy[t.cannon.id] ?? 0, gcE));
    const selected = sel?.kind === "node" && sel.key === t.key;
    const circ = 2 * Math.PI * (R + 5);
    const g = s(
      "g",
      { class: `node${selected ? " sel" : ""}${w > 0 ? " armed" : ""}`, "data-key": t.key, transform: `translate(${p.x},${p.y})` },
      s("title", null, `${t.label}: ${Math.round(w * 1000) / 10}% of the swarm, shield ${num(sh)}, expected impact ${num(impact, 1)} (intelligence)`),
      s("circle", { r: R, class: "node-body" }),
      s("circle", { r: R + 5, class: "node-ring-bg" }),
      w > 0 ? s("circle", { r: R + 5, class: "node-ring", "stroke-dasharray": `${circ * Math.min(1, w)} ${circ}`, transform: "rotate(-90)" }) : null,
      s("text", { y: -8, class: "node-share", "text-anchor": "middle" }, `${Math.round(w * 1000) / 10}%`),
      s("text", { y: 9, class: "node-small", "text-anchor": "middle" }, `shield ${num(sh)}`),
      s("text", { y: 23, class: "node-small dim", "text-anchor": "middle" }, `impact≈${num(impact, 1)}`),
    );
    nodeLayer.append(g);
  }

  const temp = s("path", { class: "route temp", d: "" }) as SVGPathElement;
  svg.append(routeLayer, nodeLayer, labelLayer, temp);

  // interaction
  function toSvg(e: PointerEvent): Pt {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const m = svg.getScreenCTM();
    return m ? pt.matrixTransform(m.inverse()) : pt;
  }
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
    if (drag.moved && cb.allowRoutes !== false) {
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
    if (moved && target && target !== from && cb.allowRoutes !== false) cb.addRoute(from, target);
    else if (!moved) cb.select({ kind: "node", key: from });
  };
}
