import type { Scenario } from "../engine/model";
import type { FormationResult } from "../engine/battle";
import { shield } from "../engine/normal";
import { CANNON_COLORS, FH, PAL, fieldLayout } from "./battlefield";
import type { Moment } from "./timeline";

/** Stats panel beside the battlefield: one row per ship, in the same arrangement as the lanes. */
export const SW = 380;
const ZMAX = 5;

export interface StatsView {
  sc: Scenario;
  fr: FormationResult | null;
  mo: Moment | null;
  idleWeights: number[];
}

export function drawStats(ctx: CanvasRenderingContext2D, v: StatsView) {
  const { sc, fr, mo } = v;
  const L = fieldLayout(sc);
  const K = L.K;
  const C = L.C;
  const weights = mo ? mo.weights : v.idleWeights;

  ctx.fillStyle = "#070d15";
  ctx.fillRect(0, 0, SW, FH);

  const colW = (SW - 20) / C;
  const bw = colW - 18;
  const x0 = (c: number) => 12 + c * colW;
  const X = (c: number, z: number) => x0(c) + (bw * Math.max(0, Math.min(ZMAX, z))) / ZMAX;

  // headers
  ctx.textAlign = "left";
  sc.cannons.forEach((can, c) => {
    ctx.fillStyle = CANNON_COLORS[c % CANNON_COLORS.length];
    ctx.font = "12px ui-monospace, monospace";
    ctx.fillText(can.name, x0(c), 24);
  });
  ctx.fillStyle = PAL.dim;
  ctx.font = "10px ui-monospace, monospace";
  ctx.fillText(`impact vs shield, scale 0–${ZMAX}`, 12, 40);

  for (let r = 0; r < K; r++) {
    const k = L.classAt[r];
    const y = L.rowY(r);
    // row band
    ctx.fillStyle = "rgba(23,50,74,0.18)";
    ctx.fillRect(4, y - 34, SW - 8, 68);
    ctx.fillStyle = PAL.dim;
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillText(sc.classes[k].name, 8, y - 24);
    for (let c = 0; c < C; c++) {
      const i = c * K + k;
      const w = weights[i] ?? 0;
      const sh = shield(w, sc.alpha);
      const left = x0(c);
      // track
      ctx.fillStyle = PAL.track;
      ctx.strokeStyle = PAL.border;
      ctx.lineWidth = 1;
      ctx.fillRect(left, y - 6, bw, 14);
      ctx.strokeRect(left + 0.5, y - 5.5, bw - 1, 13);

      const canFire = fr ? Number.isFinite(fr.shots[i]) : true;
      const revealed = !!(mo && fr && mo.revealed[i]);
      let note = "";
      let noteColor = PAL.dim;
      if (!canFire) note = "cannon offline";
      else if (revealed) {
        const cp = fr!.cannonPart[i];
        const z = fr!.shots[i];
        // cannon's part
        ctx.fillStyle = CANNON_COLORS[c % CANNON_COLORS.length];
        ctx.globalAlpha = 0.85;
        ctx.fillRect(X(c, 0), y - 4, X(c, Math.min(cp, z)) - X(c, 0), 10);
        // tracking: adds (green) or takes away (red, hatched over the cannon's part)
        if (z >= cp) {
          ctx.fillStyle = PAL.green;
          ctx.fillRect(X(c, cp), y - 4, X(c, z) - X(c, cp), 10);
        } else {
          ctx.globalAlpha = 0.9;
          ctx.strokeStyle = PAL.red;
          ctx.lineWidth = 1;
          const a = X(c, z);
          const b = X(c, cp);
          ctx.strokeRect(a + 0.5, y - 3.5, Math.max(0, b - a - 1), 9);
          for (let x = a; x < b; x += 4) {
            ctx.beginPath();
            ctx.moveTo(x, y + 6);
            ctx.lineTo(Math.min(b, x + 6), y - 4);
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
        if (z > ZMAX) arrow(ctx, X(c, ZMAX) + 2, y + 1, PAL.text);
        note = `impact ${z.toFixed(2)}`;
        noteColor = Number.isFinite(sh) && z > sh ? PAL.amber : PAL.text;
      } else if (mo && mo.absorbed[i]) {
        note = "absorbed";
      } else if (w <= 0) {
        note = "no drones";
      } else {
        note = "impact ?";
      }

      // shield marker (gone once the ship has fallen)
      const down = !!(mo && mo.fallen[i] && mo.exploding !== i);
      ctx.fillStyle = PAL.amber;
      if (down) {
        /* no shield left */
      } else if (Number.isFinite(sh)) {
        const sx = X(c, sh);
        ctx.fillRect(sx - 1, y - 10, 2, 22);
        ctx.font = "10px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.fillText(sh.toFixed(2), Math.min(left + bw - 12, Math.max(left + 12, sx)), y + 23);
        ctx.textAlign = "left";
      } else {
        ctx.font = "12px ui-monospace, monospace";
        ctx.textAlign = "right";
        ctx.fillText("∞", left + bw + 12, y + 7);
        ctx.textAlign = "left";
      }

      // status line above the bar
      let status = "";
      let statusColor = PAL.dim;
      if (mo && mo.fallen[i] && mo.exploding !== i) {
        status = "✔ stopped";
        statusColor = PAL.green;
      } else if (mo && mo.exploding === i) {
        status = "✸ breached";
        statusColor = PAL.amber;
      } else if (mo && mo.leave > 0) {
        status = "✖ passed";
        statusColor = PAL.red;
      }
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillStyle = noteColor;
      ctx.fillText(note, left, y - 11);
      if (status) {
        ctx.fillStyle = statusColor;
        ctx.textAlign = "right";
        ctx.fillText(status, left + bw, y - 11);
        ctx.textAlign = "left";
      }
    }
  }

  // legend
  let y = L.rowY(K - 1) + 64;
  const key = (color: string, label: string, hatch = false) => {
    ctx.fillStyle = color;
    if (hatch) {
      ctx.strokeStyle = color;
      ctx.strokeRect(12.5, y - 7.5, 13, 9);
    } else ctx.fillRect(12, y - 8, 14, 10);
    ctx.fillStyle = PAL.text;
    ctx.font = "11px ui-monospace, monospace";
    ctx.fillText(label, 32, y + 1);
    y += 17;
  };
  key(CANNON_COLORS[0], "cannon's part of the impact");
  key(PAL.green, "tracking adds to it");
  key(PAL.red, "tracking takes away", true);
  ctx.fillStyle = PAL.amber;
  ctx.fillRect(18, y - 11, 2, 15);
  ctx.fillStyle = PAL.text;
  ctx.fillText("shield: impact must pass it", 32, y + 1);
  y += 22;
  ctx.fillStyle = PAL.dim;
  ctx.font = "10px ui-monospace, monospace";
  for (const line of ["Ground Control tracks for every cannon.", "Its error shifts each class by the same", "amount in every lane (see the reticles)."]) {
    ctx.fillText(line, 12, y);
    y += 13;
  }
}

function arrow(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - 5);
  ctx.lineTo(x + 6, y);
  ctx.lineTo(x, y + 5);
  ctx.closePath();
  ctx.fill();
}
