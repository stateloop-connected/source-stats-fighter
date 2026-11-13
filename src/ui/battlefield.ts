import type { Design, Scenario } from "../engine/model";
import type { FormationResult } from "../engine/battle";
import { shield } from "../engine/normal";
import { Rng } from "../engine/rng";
import { curve } from "./network";
import { HIT_AT, type Moment } from "./timeline";

/* ---------------- palette ---------------- */

export const PAL = {
  bg: "#04060c",
  text: "#c8f7d8",
  dim: "#5d7a8c",
  green: "#39ff88",
  drone: "#4de1ff",
  amber: "#ffb000",
  red: "#ff4d5e",
  wormhole: "#7d5cff",
  planet1: "#0f3b57",
  planet2: "#05121e",
  track: "#050b12",
  border: "#17324a",
};
export const CANNON_COLORS = ["#ff7a3d", "#c07cff", "#4dd2ff"];
export const DRONES = 40;

/* ---------------- layout ---------------- */

export const FW = 720;
export const FH = 600;

export interface Pt {
  x: number;
  y: number;
}

export interface FieldLayout {
  C: number;
  K: number;
  /** Row of each class on screen, top to bottom; primary classes are nearest the guns. */
  rowOf: number[];
  /** Class shown in each row. */
  classAt: number[];
  rowY(r: number): number;
  laneX(c: number): number;
  ship(c: number, k: number): Pt;
  cannon(c: number): Pt;
  gc: Pt;
  surfaceY(x: number): number;
}

const PLANET = { cx: FW / 2, cy: 1430, r: 920 };

export function fieldLayout(sc: Scenario): FieldLayout {
  const C = sc.cannons.length;
  const K = sc.classes.length;
  const order = [...sc.classes.keys()].sort((a, b) => Number(sc.classes[a].primary) - Number(sc.classes[b].primary) || a - b);
  const rowOf = new Array<number>(K);
  order.forEach((k, r) => (rowOf[k] = r));
  const top = 80;
  const bottom = 400;
  const rowY = (r: number) => (K === 1 ? bottom : top + ((bottom - top) * r) / (K - 1));
  const laneX = (c: number) => 90 + ((FW - 120) * (c + 0.5)) / C;
  const surfaceY = (x: number) => PLANET.cy - Math.sqrt(Math.max(0, PLANET.r * PLANET.r - (x - PLANET.cx) ** 2));
  const gcX = C % 2 === 0 ? FW / 2 + 15 : C === 1 ? laneX(0) + 150 : (laneX(0) + laneX(1)) / 2;
  return {
    C,
    K,
    rowOf,
    classAt: order,
    rowY,
    laneX,
    ship: (c, k) => ({ x: laneX(c), y: rowY(rowOf[k]) }),
    cannon: (c) => ({ x: laneX(c), y: surfaceY(laneX(c)) - 4 }),
    gc: { x: gcX, y: surfaceY(gcX) + 40 },
    surfaceY,
  };
}

/* ---------------- view ---------------- */

export interface FieldView {
  sc: Scenario;
  design: Design;
  fr: FormationResult | null;
  mo: Moment | null;
  now: number;
  /** Drone shares to show when no formation is on the board. */
  idleWeights: number[];
  ended: { win: boolean } | null;
}

const stars = (() => {
  const r = new Rng(7);
  return Array.from({ length: 150 }, () => ({ x: r.uniform() * FW, y: r.uniform() * FH, b: 0.2 + r.uniform() * 0.8, s: r.uniform() < 0.1 ? 1.6 : 0.9 }));
})();

const SHIP_R = 28;

export function drawField(ctx: CanvasRenderingContext2D, v: FieldView) {
  const { sc, fr, mo, now } = v;
  const L = fieldLayout(sc);
  const K = L.K;
  const alpha = sc.alpha;
  const weights = mo ? mo.weights : v.idleWeights;

  // sky
  ctx.fillStyle = PAL.bg;
  ctx.fillRect(0, 0, FW, FH);
  for (const st of stars) {
    ctx.fillStyle = `rgba(200,230,255,${st.b * (0.7 + 0.3 * Math.sin(now / 900 + st.x))})`;
    ctx.fillRect(st.x, st.y, st.s, st.s);
  }

  // planet
  const g = ctx.createRadialGradient(PLANET.cx, PLANET.cy - PLANET.r * 0.6, 60, PLANET.cx, PLANET.cy, PLANET.r);
  g.addColorStop(0, PAL.planet1);
  g.addColorStop(1, PAL.planet2);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(PLANET.cx, PLANET.cy, PLANET.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(77,225,255,0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(PLANET.cx, PLANET.cy, PLANET.r + 3, Math.PI * 1.2, Math.PI * 1.8);
  ctx.stroke();

  // lanes
  ctx.setLineDash([3, 7]);
  ctx.strokeStyle = "rgba(93,122,140,0.25)";
  ctx.lineWidth = 1;
  for (let c = 0; c < L.C; c++) {
    const x = L.laneX(c);
    ctx.beginPath();
    ctx.moveTo(x, 40);
    ctx.lineTo(x, L.cannon(c).y - 20);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // class labels
  ctx.textAlign = "left";
  for (let r = 0; r < K; r++) {
    const k = L.classAt[r];
    const cls = sc.classes[k];
    ctx.fillStyle = PAL.text;
    ctx.font = "13px ui-monospace, monospace";
    ctx.fillText(`${cls.name}${cls.primary ? " ★" : ""}`, 8, L.rowY(r) - 2);
    ctx.fillStyle = PAL.dim;
    ctx.font = "11px ui-monospace, monospace";
    ctx.fillText(`goal ${Math.round(cls.goal * 100)}%`, 8, L.rowY(r) + 13);
  }

  // where each ship is now
  const arrive = mo ? mo.arrive : 1;
  const leave = mo ? mo.leave : 0;
  const pos = (i: number): Pt => {
    const c = Math.floor(i / K);
    const k = i % K;
    const p = L.ship(c, k);
    const y0 = p.y - (1 - arrive) * 520;
    const cy = L.cannon(c).y - 30;
    return { x: p.x, y: y0 + (cy - y0) * leave };
  };
  const m = L.C * K;
  const standing = (i: number) => !(mo && mo.fallen[i] && mo.exploding !== i);
  const visible = (i: number) => standing(i) && leave < 0.98;

  // wormholes between ships
  const idx = new Map<string, number>();
  sc.cannons.forEach((c, ci) => sc.classes.forEach((k, ki) => idx.set(`${c.id}:${k.id}`, ci * K + ki)));
  const active = new Set(mo?.flights.map((f) => `${f.from}>${f.to}`) ?? []);
  for (const r of v.design.routes) {
    const a = idx.get(r.from);
    const b = idx.get(r.to);
    if (a === undefined || b === undefined || !(r.share > 0)) continue;
    if (leave > 0) continue;
    const on = active.has(`${a}>${b}`);
    const dead = mo && mo.fallen[b] && !on;
    const cv = curve(pos(a), pos(b), SHIP_R + 8, 0.25);
    ctx.strokeStyle = on ? PAL.wormhole : dead ? "rgba(125,92,255,0.12)" : "rgba(125,92,255,0.4)";
    ctx.lineWidth = on ? 3 : 1.5;
    ctx.setLineDash(on ? [] : [5, 5]);
    ctx.beginPath();
    ctx.moveTo(cv.p0.x, cv.p0.y);
    ctx.quadraticCurveTo(cv.c.x, cv.c.y, cv.p2.x, cv.p2.y);
    ctx.stroke();
    ctx.setLineDash([]);
    if (!dead) arrowHead(ctx, cv.c, cv.p2, on ? PAL.wormhole : "rgba(125,92,255,0.5)");
  }

  // Ground Control: tracking link and dish
  ctx.strokeStyle = "rgba(57,255,136,0.25)";
  ctx.setLineDash([2, 4]);
  for (let c = 0; c < L.C; c++) {
    const p = L.cannon(c);
    ctx.beginPath();
    ctx.moveTo(L.gc.x, L.gc.y - 10);
    ctx.lineTo(p.x, p.y + 8);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  drawDish(ctx, L.gc.x, L.gc.y, (v.design.energy.gc ?? 0) > 0);
  ctx.fillStyle = PAL.green;
  ctx.font = "11px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillText("Ground Control", L.gc.x, L.gc.y + 30);

  // cannons
  sc.cannons.forEach((can, c) => {
    const p = L.cannon(c);
    const on = (v.design.energy[can.id] ?? 0) > 0 && (v.design.energy.gc ?? 0) > 0;
    const color = on ? CANNON_COLORS[c % CANNON_COLORS.length] : PAL.dim;
    drawCannon(ctx, p, color);
    ctx.fillStyle = color;
    ctx.font = "12px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(can.name, p.x, p.y + 28);
    ctx.fillStyle = PAL.dim;
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillText(on ? `energy ${v.design.energy[can.id] ?? 0}` : "offline", p.x, p.y + 41);
  });

  // beams (before ships, so ships sit on top)
  if (mo && fr && mo.seg.kind === "fire") {
    const q = mo.q;
    const reach = Math.min(1, q / HIT_AT);
    const fade = q < HIT_AT ? 1 : Math.max(0, 1 - (q - HIT_AT) / (1 - HIT_AT));
    for (let i = 0; i < m; i++) {
      if (!mo.firedAt[i]) continue;
      const c = Math.floor(i / K);
      const a = { x: L.cannon(c).x, y: L.cannon(c).y - 22 };
      const b = pos(i);
      // ships further up the lane are reached by beams that bow around the nearer ships
      const below = K - 1 - L.rowOf[i % K];
      const side = below % 2 === 1 ? -1 : 1;
      const cp = { x: a.x + side * 52 * below, y: (a.y + b.y) / 2 };
      ctx.globalAlpha = 0.25 + 0.75 * fade;
      ctx.strokeStyle = CANNON_COLORS[c % CANNON_COLORS.length];
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      for (let s = 1; s <= 40; s++) {
        const t = (s / 40) * reach;
        const x = (1 - t) ** 2 * a.x + 2 * (1 - t) * t * cp.x + t * t * b.x;
        const y = (1 - t) ** 2 * a.y + 2 * (1 - t) * t * cp.y + t * t * b.y;
        if (Math.hypot(x - b.x, y - b.y) < SHIP_R + 4) break;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // ships
  for (let i = 0; i < m; i++) {
    if (!visible(i)) continue;
    const k = i % K;
    const p = pos(i);
    const exploding = mo?.exploding === i;
    if (exploding) {
      drawExplosion(ctx, p.x, p.y, mo!.q, i);
      if (mo!.q < 0.35) drawShip(ctx, p.x, p.y, k, 1 - mo!.q * 2.5);
      continue;
    }
    ctx.globalAlpha = 1 - leave * 0.7;
    const w = weights[i] ?? 0;
    const sh = shield(w, alpha);
    // shield bubble: thick and bright when strong, a bright double ring when there are no drones
    const hitNow = mo && mo.seg.kind === "fire" && mo.firedAt[i] && mo.q >= HIT_AT ? 1 - (mo.q - HIT_AT) / (1 - HIT_AT) : 0;
    if (!Number.isFinite(sh)) {
      ctx.strokeStyle = `rgba(200,240,255,${0.35 + 0.6 * hitNow})`;
      ctx.lineWidth = 3 + 3 * hitNow;
      ctx.beginPath();
      ctx.arc(p.x, p.y, SHIP_R + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, SHIP_R + 9, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      const strength = Math.max(0.1, Math.min(1, (sh - 1) / 3));
      const broke = fr && hitNow > 0 && fr.shots[i] > sh;
      ctx.strokeStyle = broke ? `rgba(255,77,94,${0.4 + 0.6 * hitNow})` : `rgba(77,225,255,${0.25 + 0.5 * strength + 0.3 * hitNow})`;
      ctx.lineWidth = 1 + 4 * strength;
      ctx.setLineDash(broke ? [6, 4] : []);
      ctx.beginPath();
      ctx.arc(p.x, p.y, SHIP_R + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    drawShip(ctx, p.x, p.y, k, 1);
    // drones orbit the ship
    drawDrones(ctx, p.x, p.y, Math.round(w * DRONES), now, i);
    // Ground Control's reticle: off-centre by the class's tracking error, the same in every lane
    if (fr && mo && arrive >= 1 && leave === 0) {
      const off = Math.max(-22, Math.min(22, fr.trackError[k] * 160));
      drawReticle(ctx, p.x + off, p.y);
    }
    ctx.globalAlpha = 1;
  }

  // drones in flight
  if (mo && mo.flights.length) {
    for (const f of mo.flights) {
      const cv = curve(pos(f.from), pos(f.to), SHIP_R + 8, 0.25);
      const n = Math.max(1, Math.round(f.amount * DRONES));
      ctx.fillStyle = PAL.drone;
      for (let j = 0; j < n; j++) {
        const tt = Math.max(0, Math.min(1, mo.q * 1.25 - (j / n) * 0.25));
        const x = (1 - tt) ** 2 * cv.p0.x + 2 * (1 - tt) * tt * cv.c.x + tt * tt * cv.p2.x;
        const y = (1 - tt) ** 2 * cv.p0.y + 2 * (1 - tt) * tt * cv.c.y + tt * tt * cv.p2.y;
        ctx.beginPath();
        ctx.arc(x + Math.sin(j * 2.1) * 3, y + Math.cos(j * 1.7) * 3, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  if (mo && mo.seg.kind === "travel" && mo.lost > 1e-9 && fr) {
    const src = pos(fr.steps[mo.seg.step].target);
    const n = Math.max(1, Math.round(mo.lost * DRONES));
    ctx.fillStyle = `rgba(77,225,255,${1 - mo.q})`;
    for (let j = 0; j < n; j++) {
      const a = (j / n) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(src.x + Math.cos(a) * (20 + 60 * mo.q), src.y + Math.sin(a) * (20 + 60 * mo.q) - 40 * mo.q, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (v.ended) {
    ctx.fillStyle = "rgba(4,6,12,0.55)";
    ctx.fillRect(0, 0, FW, FH);
    ctx.textAlign = "center";
    ctx.font = "bold 40px ui-monospace, monospace";
    ctx.fillStyle = v.ended.win ? PAL.green : PAL.red;
    ctx.fillText(v.ended.win ? "VICTORY" : "DEFEAT", FW / 2, FH / 2 - 20);
    ctx.font = "14px ui-monospace, monospace";
    ctx.fillStyle = PAL.text;
    ctx.fillText("Debrief below", FW / 2, FH / 2 + 12);
  }
}

/* ---------------- sprites ---------------- */

function arrowHead(ctx: CanvasRenderingContext2D, c: Pt, p: Pt, color: string) {
  const ang = Math.atan2(p.y - c.y, p.x - c.x);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x - 9 * Math.cos(ang - 0.4), p.y - 9 * Math.sin(ang - 0.4));
  ctx.lineTo(p.x - 9 * Math.cos(ang + 0.4), p.y - 9 * Math.sin(ang + 0.4));
  ctx.closePath();
  ctx.fill();
}

function drawDrones(ctx: CanvasRenderingContext2D, x: number, y: number, n: number, now: number, seed: number) {
  ctx.fillStyle = PAL.drone;
  for (let j = 0; j < n; j++) {
    const ring = j % 2;
    const a = (j / Math.max(1, n)) * Math.PI * 2 + now / (ring ? 1400 : 1900) * (ring ? -1 : 1) + seed;
    const rx = SHIP_R + 12 + ring * 6;
    const ry = (SHIP_R + 12 + ring * 6) * 0.55;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * rx, y + Math.sin(a) * ry, 1.9, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawReticle(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.strokeStyle = "rgba(57,255,136,0.85)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(x, y, 8, 0, Math.PI * 2);
  ctx.moveTo(x - 13, y);
  ctx.lineTo(x - 4, y);
  ctx.moveTo(x + 4, y);
  ctx.lineTo(x + 13, y);
  ctx.moveTo(x, y - 13);
  ctx.lineTo(x, y - 4);
  ctx.moveTo(x, y + 4);
  ctx.lineTo(x, y + 13);
  ctx.stroke();
}

function drawCannon(ctx: CanvasRenderingContext2D, p: Pt, color: string) {
  ctx.fillStyle = "#0b1a26";
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(p.x, p.y + 4, 14, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillRect(p.x - 3, p.y - 22, 6, 20);
}

function drawDish(ctx: CanvasRenderingContext2D, x: number, y: number, on: boolean) {
  ctx.strokeStyle = on ? PAL.green : PAL.dim;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 14, Math.PI * 1.1, Math.PI * 1.9);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y - 6);
  ctx.lineTo(x, y + 12);
  ctx.moveTo(x - 9, y + 12);
  ctx.lineTo(x + 9, y + 12);
  ctx.stroke();
}

/** Enemy ship pointing down towards the planet; shape by class. */
export function drawShip(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, a: number, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 2);
  ctx.scale(scale, scale);
  ctx.globalAlpha *= a;
  ctx.strokeStyle = PAL.red;
  ctx.fillStyle = "rgba(255,77,94,0.18)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  switch (k % 4) {
    case 0: // attack: arrowhead
      ctx.moveTo(-20, 0);
      ctx.lineTo(16, -14);
      ctx.lineTo(8, 0);
      ctx.lineTo(16, 14);
      break;
    case 1: // recon: diamond
      ctx.moveTo(-18, 0);
      ctx.lineTo(0, -11);
      ctx.lineTo(18, 0);
      ctx.lineTo(0, 11);
      break;
    case 2: // supply: hexagon
      for (let i = 0; i < 6; i++) {
        const an = (Math.PI / 3) * i;
        const px = 17 * Math.cos(an);
        const py = 13 * Math.sin(an);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      break;
    default: // cruiser
      ctx.moveTo(-24, 0);
      ctx.lineTo(-10, -9);
      ctx.lineTo(22, -9);
      ctx.lineTo(22, 9);
      ctx.lineTo(-10, 9);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawExplosion(ctx: CanvasRenderingContext2D, x: number, y: number, q: number, seed: number) {
  const r = new Rng(1000 + seed);
  ctx.globalAlpha = Math.max(0, 1 - q);
  ctx.strokeStyle = PAL.amber;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 8 + 44 * q, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = PAL.amber;
  for (let i = 0; i < 16; i++) {
    const a = r.uniform() * Math.PI * 2;
    const d = (10 + r.uniform() * 55) * q;
    ctx.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d, 3, 3);
  }
  ctx.globalAlpha = 1;
}
