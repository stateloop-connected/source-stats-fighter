import type { Route } from "./model";

/**
 * Layout of the network editor, shared with the LaTeX export.
 * Ship classes are rows (top to bottom), cannons are columns (left to right).
 */
export const NODE_R = 40;
export const COL = 190;
export const ROW = 150;
export const LEFT = 150;
export const TOP = 80;

export interface Pt {
  x: number;
  y: number;
}

export function nodePos(c: number, k: number): Pt {
  return { x: LEFT + c * COL, y: TOP + k * ROW };
}

export interface EdgeGeometry {
  /** Start and end on the node rims. */
  p0: Pt;
  p2: Pt;
  /** Control point of the quadratic curve. */
  c: Pt;
  /** Where the share label sits (on the curve). */
  label: Pt;
  /** Default label position, before any offset the player applied. */
  base: Pt;
}

/**
 * Quadratic edge between two node centres. By default it bows to the right of the direction of travel;
 * with an offset, the curve is bent so that it passes through the moved label.
 */
export function edgeGeometry(a: Pt, b: Pt, offset?: Pt | null, r = NODE_R, bow = 0.3): EdgeGeometry {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 1;
  const nx = -dy / d;
  const ny = dx / d;
  const off = d * bow + 12;
  const c0 = { x: (a.x + b.x) / 2 + nx * off, y: (a.y + b.y) / 2 + ny * off };
  // midpoint of the curve between centres
  const base = { x: 0.25 * a.x + 0.5 * c0.x + 0.25 * b.x, y: 0.25 * a.y + 0.5 * c0.y + 0.25 * b.y };
  const label = offset ? { x: base.x + offset.x, y: base.y + offset.y } : base;
  // control point so that the curve passes through the label at t = 1/2
  const c = offset ? { x: 2 * label.x - (a.x + b.x) / 2, y: 2 * label.y - (a.y + b.y) / 2 } : c0;
  const trim = (p: Pt) => {
    const vx = c.x - p.x;
    const vy = c.y - p.y;
    const l = Math.hypot(vx, vy) || 1;
    return { x: p.x + (vx / l) * r, y: p.y + (vy / l) * r };
  };
  return { p0: trim(a), p2: trim(b), c, label, base };
}

export function routeGeometry(from: { c: number; k: number }, to: { c: number; k: number }, r: Pick<Route, "label">): EdgeGeometry {
  return edgeGeometry(nodePos(from.c, from.k), nodePos(to.c, to.k), r.label);
}
