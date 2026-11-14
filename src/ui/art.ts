import { h } from "./dom";

/**
 * Picture slots. Each slot names a file in `public/art/` and has a native size. The picture is
 * enlarged by whole factors without smoothing. When the file is missing, a plain drawn fallback
 * of the same size is shown instead, so the game is complete without any artwork.
 */

export type Fallback = "space" | "horizon" | "portrait" | "wreckage" | "fleet" | "insignia";

export interface ArtOpts {
  /** Largest enlargement factor (default 4). */
  maxScale?: number;
  /** Smallest enlargement factor (default 1). */
  minScale?: number;
  fallback?: Fallback;
  /** Short text shown on the fallback (never drawn on real artwork). */
  label?: string;
  class?: string;
  alt?: string;
}

const status = new Map<string, Promise<boolean>>();

/** Whether `art/<name>.png` exists (checked once per page load). */
function available(name: string): Promise<boolean> {
  let p = status.get(name);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img.naturalWidth > 0);
      img.onerror = () => resolve(false);
      img.src = src(name);
    });
    status.set(name, p);
  }
  return p;
}

const src = (name: string) => `${import.meta.env.BASE_URL}art/${name}.png`;

export function art(name: string, w: number, hgt: number, opts: ArtOpts = {}): HTMLElement {
  const box = h("div", { class: `art ${opts.class ?? ""}`, "data-art": name, style: `--w:${w}px;--h:${hgt}px` });
  const maxScale = opts.maxScale ?? 4;
  const minScale = opts.minScale ?? 1;
  let inner: HTMLElement | null = null;
  const fit = () => {
    if (!inner) return;
    const avail = box.clientWidth || w;
    const scale = Math.max(minScale, Math.min(maxScale, Math.floor(avail / w)));
    // narrower than native size (very small screens): shrink, still without smoothing
    const width = avail < w * minScale ? avail : w * scale;
    inner.style.width = `${width}px`;
    inner.style.height = `${(width / w) * hgt}px`;
  };
  const place = (el: HTMLElement) => {
    inner = el;
    box.replaceChildren(el);
    fit();
  };
  // reserve space at once with the fallback, swap in the picture when it has loaded
  place(drawFallback(opts.fallback ?? "space", w, hgt, name, opts.label));
  available(name).then((ok) => {
    if (!ok) return;
    const img = h("img", { src: src(name), alt: opts.alt ?? "", width: w, height: hgt, draggable: "false" });
    place(img);
  });
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(fit).observe(box);
  requestAnimationFrame(fit);
  return box;
}

/* ---------------- fallbacks, drawn at native size ---------------- */

const PAL = {
  bg: "#04060c",
  star: "#6b8a9c",
  starHi: "#c8f7d8",
  planet: "#0f3b4a",
  planetHi: "#1d6b6e",
  rim: "#39ff88",
  red: "#ff4d5e",
  amber: "#ffb000",
  cyan: "#4de1ff",
  dim: "#17324a",
  violet: "#7d5cff",
};

/** Deterministic pseudo-random numbers from a string, so a slot always looks the same. */
function seeded(name: string) {
  let s = 2166136261;
  for (const ch of name) s = Math.imul(s ^ ch.charCodeAt(0), 16777619);
  return () => {
    s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d);
    s = Math.imul(s ^ (s >>> 12), 0x297a2d39);
    return ((s ^= s >>> 15) >>> 0) / 4294967296;
  };
}

function drawFallback(kind: Fallback, w: number, hgt: number, name: string, label?: string): HTMLElement {
  const c = h("canvas", { width: w, height: hgt, class: "art-fallback", "aria-hidden": "true" });
  const g = c.getContext("2d");
  const wrap = h("div", { class: "art-frame" }, c, label ? h("span", { class: "art-label" }, label) : null);
  if (!g) return wrap;
  const rnd = seeded(name);
  const px = (x: number, y: number, col: string, s = 1) => {
    g.fillStyle = col;
    g.fillRect(Math.round(x), Math.round(y), s, s);
  };
  g.fillStyle = PAL.bg;
  g.fillRect(0, 0, w, hgt);
  if (kind !== "portrait" && kind !== "insignia") for (let i = 0; i < (w * hgt) / 90; i++) px(rnd() * w, rnd() * hgt, rnd() < 0.15 ? PAL.starHi : PAL.star);

  if (kind === "horizon" || kind === "wreckage" || kind === "fleet") {
    // a planet's curved horizon along the bottom, dithered towards the rim
    const R = w * 1.6;
    const cx = w / 2;
    const cy = hgt - 26 + R;
    for (let x = 0; x < w; x++) {
      const top = cy - Math.sqrt(Math.max(0, R * R - (x - cx) ** 2));
      for (let y = Math.max(0, Math.floor(top)); y < hgt; y++) {
        const d = y - top;
        const col = d < 1 ? PAL.rim : d < 4 ? ((x + y) % 2 ? PAL.planetHi : PAL.planet) : (x + y) % 4 === 0 && d < 9 ? PAL.planetHi : PAL.planet;
        px(x, y, col);
      }
    }
  }
  if (kind === "fleet") {
    for (let i = 0; i < 14; i++) {
      const x = 20 + rnd() * (w - 40);
      const y = 8 + rnd() * (hgt * 0.5);
      px(x, y, PAL.red, 2);
      px(x - 1, y - 1, PAL.red);
      px(x + 2, y - 1, PAL.red);
    }
  }
  if (kind === "wreckage") {
    for (let i = 0; i < 22; i++) {
      const x = rnd() * w;
      const y = 10 + rnd() * (hgt * 0.6);
      px(x, y, rnd() < 0.5 ? PAL.amber : PAL.dim, rnd() < 0.3 ? 2 : 1);
    }
  }
  if (kind === "portrait") {
    // head and shoulders in silhouette, lit from a screen
    g.fillStyle = PAL.dim;
    g.fillRect(0, 0, w, hgt);
    for (let y = 0; y < hgt; y += 2) for (let x = (y / 2) % 2; x < w; x += 2) px(x, y, PAL.bg);
    const cx = w / 2;
    g.fillStyle = "#0a121c";
    g.beginPath();
    g.ellipse(cx, hgt * 0.4, w * 0.18, hgt * 0.22, 0, 0, Math.PI * 2);
    g.fill();
    g.fillRect(cx - w * 0.36, hgt * 0.7, w * 0.72, hgt * 0.3);
    g.fillRect(cx - w * 0.08, hgt * 0.58, w * 0.16, hgt * 0.14);
    for (let y = Math.round(hgt * 0.74); y < hgt; y += 3) px(cx - w * 0.3, y, PAL.rim, 2);
    px(cx + w * 0.22, hgt * 0.76, PAL.amber, 3);
  }
  if (kind === "insignia") {
    g.clearRect(0, 0, w, hgt);
    g.fillStyle = PAL.dim;
    g.fillRect(4, hgt / 2 - 3, w - 8, 6);
  }
  return wrap;
}
