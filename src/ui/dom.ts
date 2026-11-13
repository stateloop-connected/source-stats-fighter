export type Child = Node | string | number | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Record<string, any> | null, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === "class") el.className = v;
      else if (k === "style") el.setAttribute("style", v);
      else if (k === "value" || k === "checked" || k === "disabled" || k === "selected") (el as unknown as Record<string, unknown>)[k] = v;
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

export interface NumOpts {
  min?: number;
  max?: number;
  step?: number;
  /** Values are shown and entered in `scale` units (e.g. 100 for percent). */
  scale?: number;
  width?: string;
  title?: string;
}

const tidy = (x: number) => Math.round(x * 1e6) / 1e6;

/**
 * Number field with minus and plus buttons. The buttons do not take focus, arrow keys step the value
 * (Shift for ten steps) without scrolling the page, and typed values commit on Enter or when leaving the field.
 */
export function numInput(value: number, onCommit: (v: number) => void, opts: NumOpts = {}) {
  const scale = opts.scale ?? 1;
  const step = opts.step ?? 1;
  const clamp = (v: number) => Math.min(opts.max ?? Infinity, Math.max(opts.min ?? -Infinity, v));
  let shown = tidy(value * scale);
  const input = h("input", {
    type: "text",
    inputmode: "decimal",
    class: "num",
    value: String(shown),
    title: opts.title,
    "aria-label": opts.title,
    style: `width:${opts.width ?? "4.5em"}`,
  });
  const set = (v: number) => {
    v = tidy(clamp(v));
    input.value = String(v);
    if (v === shown) return;
    shown = v;
    onCommit(Math.round((v / scale) * 1e9) / 1e9);
  };
  const nudge = (dir: number, big: boolean) => {
    const cur = parseFloat(input.value);
    const base = Number.isFinite(cur) ? cur : shown;
    set(base + dir * step * (big ? 10 : 1));
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      nudge(e.key === "ArrowUp" ? 1 : -1, e.shiftKey);
    } else if (e.key === "Enter") {
      e.preventDefault();
      commitTyped();
    } else if (e.key === "Escape") {
      input.value = String(shown);
    }
  });
  const commitTyped = () => {
    const v = parseFloat(input.value.replace(",", "."));
    if (Number.isFinite(v)) set(v);
    else input.value = String(shown);
  };
  input.addEventListener("change", commitTyped);
  const btn = (dir: number, label: string) =>
    h(
      "button",
      {
        type: "button",
        class: "step",
        tabindex: "-1",
        "aria-label": dir > 0 ? "increase" : "decrease",
        onPointerdown: (e: Event) => e.preventDefault(),
        onClick: (e: MouseEvent) => nudge(dir, e.shiftKey),
      },
      label,
    );
  return h("span", { class: "stepper" }, btn(-1, "−"), input, btn(1, "+"));
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

/**
 * A small "?" that explains a heading. Shows on hover and keyboard focus; a tap or click pins it open.
 */
export function tip(text: string) {
  const box = h("span", { class: "tip-text", role: "tooltip" }, text);
  const btn = h("button", { type: "button", class: "tip-btn", "aria-label": `Explain: ${text}` }, "?");
  const wrap = h("span", { class: "tip" }, btn, box);
  // keep the box inside the window
  const place = () =>
    requestAnimationFrame(() => {
      box.style.left = "-8px";
      const r = box.getBoundingClientRect();
      const over = r.right - (document.documentElement.clientWidth - 8);
      if (over > 0) box.style.left = `${-8 - over}px`;
    });
  wrap.addEventListener("pointerenter", place);
  btn.addEventListener("focus", place);
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    wrap.classList.toggle("open");
    place();
  });
  btn.addEventListener("keydown", (e) => {
    if (e.key === "Escape") wrap.classList.remove("open");
  });
  btn.addEventListener("blur", () => wrap.classList.remove("open"));
  return wrap;
}
