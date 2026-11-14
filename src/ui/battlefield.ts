import type { Design, Scenario } from "../engine/model";
import type { FormationResult } from "../engine/battle";
import { shield } from "../engine/normal";
import { Rng } from "../engine/rng";
import { curve } from "./network";
import { deployProgress, HIT_AT, type Moment } from "./timeline";

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

/* ---------------- sprites (public/art), each with a drawn fallback ---------------- */

/** Every sprite is drawn at this multiple of its native size, without smoothing. */
export const SPRITE_SCALE = 2;
const SHIP_KINDS = ["attack", "recon", "supply", "escort"] as const;
const sprites = new Map<string, HTMLImageElement>();
const spriteListeners = new Set<() => void>();

/** Called when a sprite file has loaded, so a still picture can be drawn again. */
export function onSpriteLoad(fn: () => void) {
  spriteListeners.add(fn);
}

/** The sprite `art/<name>.png` once it has loaded; null while loading or when the file is missing. */
function sprite(name: string): HTMLImageElement | null {
  if (typeof Image === "undefined") return null;
  let img = sprites.get(name);
  if (!img) {
    img = new Image();
    img.onload = () => spriteListeners.forEach((f) => f());
    img.src = `${import.meta.env.BASE_URL}art/${name}.png`;
    sprites.set(name, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

/**
 * Which ship a class is drawn as: by name (Attack, Recon, Supply, Escort), otherwise by position.
 * Returns an index into SHIP_KINDS.
 */
export function shipKind(className: string, k: number): number {
  const n = className.trim().toLowerCase();
  const i = SHIP_KINDS.findIndex((x) => n === x || n.startsWith(x));
  return i >= 0 ? i : k % SHIP_KINDS.length;
}

/**
 * Draw a sprite at SPRITE_SCALE, centred on x. Vertically it is centred on y, or, given a number,
 * that native pixel row (the sprite's foot) stands on y.
 */
function blit(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, anchor: number | "centre", sx = 0, sw = img.naturalWidth) {
  const w = sw * SPRITE_SCALE;
  const h = img.naturalHeight * SPRITE_SCALE;
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, sx, 0, sw, img.naturalHeight, Math.round(x - w / 2), Math.round(anchor === "centre" ? y - h / 2 : y - (anchor + 1) * SPRITE_SCALE), w, h);
  ctx.imageSmoothingEnabled = smooth;
}

/** Draw a machine darkened when it has no energy. */
function darkened(ctx: CanvasRenderingContext2D, off: boolean, draw: () => void) {
  if (!off) return draw();
  ctx.save();
  if ("filter" in ctx) ctx.filter = "grayscale(1) brightness(0.55)";
  else (ctx as CanvasRenderingContext2D).globalAlpha *= 0.45;
  draw();
  ctx.restore();
}

/** Where a cannon's beam starts: the muzzle at the top of its sprite, or the tip of the drawn barrel. */
function muzzle(p: Pt, c: number): Pt {
  const img = sprite(`cannon-${(c % 3) + 1}`);
  return img ? { x: p.x, y: p.y + CANNON_FOOT - (CANNON_FOOT_ROW + 1 - CANNON_MUZZLE_ROW) * SPRITE_SCALE } : { x: p.x, y: p.y - 22 };
}
/** The cannon sprite stands this far below the cannon's point (on the horizon). */
const CANNON_FOOT = 6;
/** Native rows of the delivered sprites: the cannons' muzzle and foot, Ground Control's foot. */
const CANNON_MUZZLE_ROW = 1;
const CANNON_FOOT_ROW = 30;
const GC_FOOT_ROW = 27;

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
/**
 * The survivors' run, as shares of the resolve segment: they descend to a low pass beside their cannon,
 * drop their bombs, then bank and fly off to the nearer side (other defences will have to deal with them).
 */
const RUN = { descend: 0.32, release: 0.3, bombFall: 0.16, turn: 0.36, turnDur: 0.14, bombs: 2 };

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
  // survivors' bombing run: the low pass beside the cannon, and the side they leave by
  const passAt = (i: number): Pt => {
    const r = L.rowOf[i % K];
    const x = L.laneX(Math.floor(i / K)) + (r % 2 === 0 ? 1 : -1) * (34 + 16 * r);
    return { x, y: L.surfaceY(x) - 72 - 10 * r };
  };
  const exitSide = (i: number) => (passAt(i).x < FW / 2 ? -1 : 1);
  const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  const turnOf = (i: number) => -exitSide(i) * (Math.PI / 2) * smooth((leave - RUN.turn) / RUN.turnDur);
  const pos = (i: number): Pt => {
    const c = Math.floor(i / K);
    const k = i % K;
    const p = L.ship(c, k);
    if (leave <= 0) return { x: p.x, y: p.y - (1 - arrive) * 520 };
    const b = passAt(i);
    if (leave < RUN.turn) return bez(p, { x: p.x, y: b.y }, b, smooth(leave / RUN.descend));
    const side = exitSide(i);
    const u = Math.pow((leave - RUN.turn) / (1 - RUN.turn), 1.6);
    return bez(b, { x: b.x + side * 90, y: b.y }, { x: side < 0 ? -60 : FW + 60, y: b.y - 170 }, u);
  };
  const m = L.C * K;
  const standing = (i: number) => !(mo && mo.fallen[i] && mo.exploding !== i);
  const visible = (i: number) => standing(i) && leave < 1;

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
  const gcOn = (v.design.energy.gc ?? 0) > 0;
  const gcImg = sprite("ground-control");
  if (gcImg) darkened(ctx, !gcOn, () => blit(ctx, gcImg, L.gc.x, L.gc.y + 14, GC_FOOT_ROW));
  else drawDish(ctx, L.gc.x, L.gc.y, gcOn);
  ctx.fillStyle = PAL.green;
  ctx.font = "11px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillText("Ground Control", L.gc.x, L.gc.y + 30);

  // cannons
  sc.cannons.forEach((can, c) => {
    const p = L.cannon(c);
    const on = (v.design.energy[can.id] ?? 0) > 0 && (v.design.energy.gc ?? 0) > 0;
    const color = on ? CANNON_COLORS[c % CANNON_COLORS.length] : PAL.dim;
    const img = sprite(`cannon-${(c % 3) + 1}`);
    if (img) darkened(ctx, !on, () => blit(ctx, img, p.x, p.y + CANNON_FOOT, CANNON_FOOT_ROW));
    else drawCannon(ctx, p, color);
    ctx.fillStyle = color;
    ctx.font = "12px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(can.name, p.x, p.y + 28);
    ctx.fillStyle = PAL.dim;
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillText(on ? `energy ${v.design.energy[can.id] ?? 0}` : "offline", p.x, p.y + 41);
  });

  // cannon fire: an energy bolt per ship fired at, flying on a path that bows around nearer ships
  const shots: { i: number; at: Pt; color: string; broke: boolean }[] = [];
  if (mo && fr && mo.seg.kind === "fire") {
    const q = mo.q;
    for (let i = 0; i < m; i++) {
      if (!mo.firedAt[i]) continue;
      const c = Math.floor(i / K);
      const a = muzzle(L.cannon(c), c);
      const b = pos(i);
      const below = K - 1 - L.rowOf[i % K];
      const side = below % 2 === 1 ? -1 : 1;
      const cp = { x: a.x + side * 52 * below, y: (a.y + b.y) / 2 };
      const color = CANNON_COLORS[c % CANNON_COLORS.length];
      const tHit = shieldContact(a, cp, b);
      if (q < 0.12) drawFlash(ctx, a, color, 1 - q / 0.12);
      if (q < HIT_AT) drawBolt(ctx, a, cp, b, (q / HIT_AT) * tHit, color);
      else shots.push({ i, at: bez(a, cp, b, tHit), color, broke: fr.shots[i] > shield(weights[i] ?? 0, alpha) });
    }
  }

  // ships
  const kinds = sc.classes.map((cls, k) => shipKind(cls.name, k));
  for (let i = 0; i < m; i++) {
    if (!visible(i)) continue;
    const k = i % K;
    const p = pos(i);
    const exploding = mo?.exploding === i;
    if (exploding) {
      if (mo!.q < 0.35) drawShip(ctx, p.x, p.y, kinds[k], 1 - mo!.q * 2.5);
      drawExplosion(ctx, p.x, p.y, mo!.q, i);
      continue;
    }
    // shield and drones fall away as the ship goes in
    const fadeOut = Math.max(0, 1 - leave * 5);
    ctx.globalAlpha = fadeOut;
    const w = weights[i] ?? 0;
    const sh = shield(w, alpha);
    // shield: a gauge ring, full when unbreakable (no drones), shorter the weaker it is (scale 0–5,
    // as in the stats panel). Drones drain it as they arrive; the drained part fades out in white.
    const hitNow = mo && mo.seg.kind === "fire" && mo.firedAt[i] && mo.q >= HIT_AT ? 1 - (mo.q - HIT_AT) / (1 - HIT_AT) : 0;
    const broke = !!fr && hitNow > 0 && fr.shots[i] > sh;
    const drainFrom = mo && (mo.seg.kind === "deploy" || mo.seg.kind === "travel") ? shieldFrac(shield(mo.weightsFrom[i] ?? 0, alpha)) : null;
    drawShield(ctx, p.x, p.y, shieldFrac(sh), drainFrom, mo ? 1 - mo.q : 0, hitNow, broke);
    ctx.globalAlpha = 1;
    const angle = leave > 0 ? turnOf(i) : 0;
    if (leave > 0) {
      // engines: a hot trail behind the ship, strongest on the way down and on the way out
      const heat = leave < RUN.descend ? 0.4 + 0.6 * (leave / RUN.descend) : leave < RUN.turn ? 0.5 : 0.6 + 0.4 * ((leave - RUN.turn) / (1 - RUN.turn));
      const back = { x: Math.sin(angle), y: -Math.cos(angle) };
      glow(ctx, { x: p.x + back.x * 18, y: p.y + back.y * 18 }, 10 + 10 * heat, PAL.amber, 0.85 * heat);
      glow(ctx, { x: p.x + back.x * 32, y: p.y + back.y * 32 }, 8 + 6 * heat, PAL.red, 0.5 * heat);
    }
    drawShip(ctx, p.x, p.y, kinds[k], 1, 1, angle);
    // drones orbit the ship
    ctx.globalAlpha = fadeOut;
    drawDrones(ctx, p.x, p.y, Math.round(w * DRONES), now, i);
    // Ground Control's reticle: off-centre by the class's tracking error, the same in every lane
    if (fr && mo && arrive >= 1 && leave === 0) {
      const off = Math.max(-22, Math.min(22, fr.trackError[k] * 160));
      drawReticle(ctx, p.x + off, p.y);
    }
    ctx.globalAlpha = 1;
  }

  // the survivors' bombs: they fall from the low pass, burst on the surface and leave burning marks
  if (mo && fr && leave > RUN.release) {
    const after = mo.seg.kind === "pause" ? mo.q : 0;
    for (let i = 0; i < m; i++) {
      if (!standing(i)) continue;
      const b = passAt(i);
      for (let j = 0; j < RUN.bombs; j++) {
        const x = b.x + (j - (RUN.bombs - 1) / 2) * 14;
        const ground = { x, y: L.surfaceY(x) + 3 };
        const t0 = RUN.release + j * 0.04;
        const f = (leave - t0) / RUN.bombFall;
        if (f <= 0) continue;
        if (f < 1) {
          const y = b.y + 10 + (ground.y - b.y - 10) * f * f;
          glow(ctx, { x, y: y - 6 }, 5, PAL.red, 0.5);
          ctx.fillStyle = PAL.amber;
          ctx.fillRect(x - 2, y - 2, 4, 4);
          continue;
        }
        const g = Math.min(1, (f - 1) * RUN.bombFall / 0.14);
        ctx.fillStyle = `rgba(255,77,94,${0.75 * (1 - after * 0.6)})`;
        ctx.beginPath();
        ctx.ellipse(ground.x, ground.y, 8, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        if (g < 1) glow(ctx, { x: ground.x, y: ground.y - 6 }, 8 + 22 * g, PAL.amber, 1 - g * 0.8);
        else glow(ctx, { x: ground.x, y: ground.y - 4 }, 7 + 3 * Math.sin(now / 90 + i + j), PAL.red, 0.6 * (1 - after * 0.6));
      }
    }
  }

  // where the bolts strike: a splash on a shield that holds, a burst through one that gives way
  for (const sh of shots) {
    if (!visible(sh.i)) continue;
    drawImpact(ctx, sh.at, pos(sh.i), (mo!.q - HIT_AT) / (1 - HIT_AT), sh.color, sh.broke);
  }

  // Ground Control launches the drones to their ships
  if (mo && mo.seg.kind === "deploy") {
    const from = { x: L.gc.x, y: L.gc.y - 16 };
    ctx.fillStyle = PAL.drone;
    for (let i = 0; i < m; i++) {
      const n = Math.round((mo.initial[i] ?? 0) * DRONES);
      if (!n) continue;
      const to = pos(i);
      const cp = { x: (from.x + to.x) / 2 + (to.x < from.x ? -60 : 60), y: Math.min(from.y, to.y) + (from.y - to.y) * 0.25 };
      for (let j = 0; j < n; j++) {
        const t = deployProgress(mo.q, j, n);
        if (t <= 0 || t >= 1) continue;
        const end = { x: to.x + Math.cos(j * 2.4) * (SHIP_R + 12), y: to.y + Math.sin(j * 2.4) * (SHIP_R + 12) * 0.55 };
        const pt = bez(from, cp, end, t);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 1.9, 0, Math.PI * 2);
        ctx.fill();
      }
    }
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

const bez = (a: Pt, c: Pt, b: Pt, t: number): Pt => ({
  x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c.x + t * t * b.x,
  y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * c.y + t * t * b.y,
});

/** Where on the path from a cannon to a ship the shot meets the shield. */
function shieldContact(a: Pt, c: Pt, b: Pt): number {
  for (let s = 1; s <= 80; s++) {
    const t = s / 80;
    const p = bez(a, c, b, t);
    if (Math.hypot(p.x - b.x, p.y - b.y) < SHIP_R + 4) return t;
  }
  return 1;
}

/** Shield shown as a share of the ring: full when unbreakable, else the shield on the 0–5 scale. */
const SHIELD_MAX = 5;
const shieldFrac = (sh: number) => (Number.isFinite(sh) ? Math.max(0.04, Math.min(1, sh / SHIELD_MAX)) : 1);

function drawShield(ctx: CanvasRenderingContext2D, x: number, y: number, frac: number, from: number | null, fade: number, hit: number, broke: boolean) {
  const r = SHIP_R + 4;
  // the ring is centred on the side facing the guns and gives way from the back
  const arc = (f: number) => {
    ctx.beginPath();
    ctx.arc(x, y, r, Math.PI / 2 - f * Math.PI, Math.PI / 2 + f * Math.PI);
  };
  ctx.lineCap = "butt";
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(77,225,255,0.10)";
  arc(1);
  ctx.stroke();
  if (from !== null && from > frac + 1e-3) {
    // what the drones just drained, fading out
    ctx.strokeStyle = `rgba(230,250,255,${0.85 * fade})`;
    arc(from);
    ctx.stroke();
  }
  if (broke) {
    ctx.strokeStyle = `rgba(255,77,94,${0.4 + 0.6 * hit})`;
    ctx.setLineDash([6, 4]);
  } else ctx.strokeStyle = `rgba(77,225,255,${0.7 + 0.3 * hit})`;
  ctx.lineWidth = 4 + 3 * hit;
  arc(frac);
  ctx.stroke();
  ctx.setLineDash([]);
  if (frac >= 1 && !broke) {
    // unbreakable: an outer ring as well
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(200,240,255,0.5)";
    ctx.beginPath();
    ctx.arc(x, y, r + 6, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function glow(ctx: CanvasRenderingContext2D, p: Pt, r: number, color: string, a: number) {
  const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
  g.addColorStop(0, `rgba(255,255,255,${a})`);
  g.addColorStop(0.35, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalAlpha = a;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawFlash(ctx: CanvasRenderingContext2D, p: Pt, color: string, a: number) {
  glow(ctx, p, 10 + 8 * a, color, a);
}

/** An energy bolt at progress t along its path, with a short fading trail. */
function drawBolt(ctx: CanvasRenderingContext2D, a: Pt, c: Pt, b: Pt, t: number, color: string) {
  for (let k = 6; k >= 1; k--) glow(ctx, bez(a, c, b, Math.max(0, t - k * 0.025)), 8 - k * 0.8, color, 0.55 - k * 0.07);
  glow(ctx, bez(a, c, b, t), 12, color, 1);
}

/** A bolt striking a shield: it splashes on one that holds and bursts through one that gives way. */
function drawImpact(ctx: CanvasRenderingContext2D, at: Pt, ship: Pt, q: number, color: string, broke: boolean) {
  const a = Math.max(0, 1 - q);
  if (broke) {
    glow(ctx, at, 10 + 22 * q, color, a);
    ctx.fillStyle = color;
    ctx.globalAlpha = a;
    for (let s = 0; s < 8; s++) {
      const an = (s / 8) * Math.PI * 2;
      ctx.fillRect(at.x + Math.cos(an) * 26 * q - 1.5, at.y + Math.sin(an) * 26 * q - 1.5, 3, 3);
    }
    ctx.globalAlpha = 1;
    return;
  }
  glow(ctx, at, 8 + 6 * q, color, a * 0.9);
  // sparks running along the shield away from the impact
  const base = Math.atan2(at.y - ship.y, at.x - ship.x);
  ctx.fillStyle = color;
  ctx.globalAlpha = a;
  for (const dir of [-1, 1])
    for (let s = 1; s <= 3; s++) {
      const an = base + dir * (0.15 + 0.5 * q) * s * 0.6;
      ctx.fillRect(ship.x + Math.cos(an) * (SHIP_R + 4) - 1, ship.y + Math.sin(an) * (SHIP_R + 4) - 1, 2, 2);
    }
  ctx.globalAlpha = 1;
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

/** Enemy ship pointing down towards the planet; `kind` indexes SHIP_KINDS (attack, recon, supply, escort). */
export function drawShip(ctx: CanvasRenderingContext2D, x: number, y: number, kind: number, a: number, scale = 1, angle = 0) {
  const img = sprite(`ship-${SHIP_KINDS[kind % SHIP_KINDS.length]}`);
  if (img && scale === 1) {
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.translate(x, y);
    ctx.rotate(angle);
    blit(ctx, img, 0, 0, "centre");
    ctx.restore();
    return;
  }
  const k = kind;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle - Math.PI / 2);
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

const EXPLOSION_FRAMES = 6;

function drawExplosion(ctx: CanvasRenderingContext2D, x: number, y: number, q: number, seed: number) {
  const strip = sprite("explosion");
  if (strip) {
    const fw = strip.naturalWidth / EXPLOSION_FRAMES;
    const f = Math.min(EXPLOSION_FRAMES - 1, Math.floor(q * EXPLOSION_FRAMES));
    blit(ctx, strip, x, y, "centre", f * fw, fw);
    return;
  }
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
