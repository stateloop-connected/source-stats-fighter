import { h, pct } from "./dom";
import { mcse } from "../engine/battle";

export interface BarSpec {
  label: string | Node;
  value: number;
  n: number;
  marker?: number;
  markerLabel?: string;
  /** "good" if value >= marker is good, "bad" if value > marker is bad. */
  sense?: "good" | "bad";
  max?: number;
  sub?: string;
}

/** Horizontal bar with a 95% Monte Carlo interval and an optional target marker. */
export function bar(b: BarSpec) {
  const max = b.max ?? 1;
  const se = mcse(b.value, b.n);
  const lo = Math.max(0, b.value - 1.96 * se);
  const hi = Math.min(max, b.value + 1.96 * se);
  const x = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  let cls = "bar-fill";
  if (b.marker !== undefined && b.sense) {
    const good = b.sense === "good" ? b.value >= b.marker : b.value <= b.marker;
    cls += good ? " good" : " bad";
  }
  const digits = max < 0.2 ? 2 : 1;
  return h(
    "div",
    { class: "bar-row" },
    h("div", { class: "bar-label" }, b.label, b.sub ? h("div", { class: "dim small" }, b.sub) : null),
    h(
      "div",
      { class: "bar-track", title: `95% interval ${pct(lo, digits)} – ${pct(hi, digits)}` },
      h("div", { class: cls, style: `width:${x(b.value)}` }),
      h("div", { class: "bar-ci", style: `left:${x(lo)};width:calc(${x(hi)} - ${x(lo)})` }),
      b.marker !== undefined ? h("div", { class: "bar-marker", style: `left:${x(b.marker)}`, title: b.markerLabel ?? "" }) : null,
    ),
    h("div", { class: "bar-value" }, pct(b.value, digits), h("span", { class: "dim small" }, ` ±${(1.96 * se * 100).toFixed(digits)}`)),
  );
}
