type Child = Node | string | number | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Record<string, any> | null, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === "class") el.className = v;
      else if (k === "style") el.setAttribute("style", v);
      else if (k === "value" || k === "checked" || k === "disabled" || k === "selected") (el as any)[k] = v;
      else el.setAttribute(k, v === true ? "" : String(v));
    }
  }
  append(el, children);
  return el;
}

function append(el: Element, children: (Child | Child[])[]) {
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
}

const SVGNS = "http://www.w3.org/2000/svg";

export function s(tag: string, attrs?: Record<string, any> | null, ...children: (Child | Child[])[]): SVGElement {
  const el = document.createElementNS(SVGNS, tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
      else el.setAttribute(k, String(v));
    }
  }
  append(el, children);
  return el;
}

export const pct = (x: number, digits = 0) => `${(x * 100).toFixed(digits)}%`;
export const num = (x: number, digits = 2) => (Number.isFinite(x) ? x.toFixed(digits) : x > 0 ? "∞" : "–∞");

/** A number input that commits on change. Values are shown and entered in `scale` units (e.g. 100 for percent). */
export function numInput(value: number, onCommit: (v: number) => void, opts: { min?: number; max?: number; step?: number; scale?: number; width?: string; title?: string } = {}) {
  const scale = opts.scale ?? 1;
  const shown = Math.round(value * scale * 1e6) / 1e6;
  return h("input", {
    type: "number",
    value: String(shown),
    min: opts.min,
    max: opts.max,
    step: opts.step ?? "any",
    title: opts.title,
    style: `width:${opts.width ?? "5.5em"}`,
    onChange: (e: Event) => {
      const v = parseFloat((e.target as HTMLInputElement).value);
      if (Number.isFinite(v)) onCommit(v / scale);
    },
  });
}

export function download(filename: string, text: string, type = "text/plain") {
  const blob = new Blob([text], { type });
  const a = h("a", { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 0);
}

let uid = 0;
export function newId(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${(uid++).toString(36)}`;
}

/** Replace an element's children; accepts nested arrays and empty values. */
export function fill(el: Element, ...children: (Child | Child[])[]) {
  el.replaceChildren();
  append(el, children);
}

/** Append children; accepts nested arrays and empty values. */
export function add(el: Element, ...children: (Child | Child[])[]) {
  append(el, children);
}
