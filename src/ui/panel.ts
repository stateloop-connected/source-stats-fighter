import { fill, type Child } from "./dom";

type Content = Child | (Child | Child[])[];

/**
 * A part of a screen that redraws itself only when its own data changes.
 * `deps` returns everything the panel shows; the panel is rebuilt when its JSON changes.
 * A panel under a pressed pointer is not rebuilt until the pointer is released, and
 * keyboard focus inside a rebuilt panel is restored to the same place.
 */
export interface Panel {
  el: HTMLElement;
  /** Rebuild if the data changed (or always, with force). */
  update(force?: boolean): void;
}

const pointer = { target: null as Element | null };
const pending = new Set<Panel>();

if (typeof document !== "undefined") {
  document.addEventListener("pointerdown", (e) => (pointer.target = e.target as Element), true);
  const release = () =>
    setTimeout(() => {
      pointer.target = null;
      const ps = [...pending];
      pending.clear();
      ps.forEach((p) => p.update());
    }, 0);
  document.addEventListener("pointerup", release, true);
  document.addEventListener("pointercancel", release, true);
}

export function panel(build: (el: HTMLElement) => Content, deps: () => unknown, el: HTMLElement = document.createElement("div")): Panel {
  let sig: string | null = null;
  const p: Panel = {
    el,
    update(force = false) {
      const next = JSON.stringify(deps() ?? null);
      if (!force && next === sig) return;
      if (pointer.target && el.contains(pointer.target)) {
        pending.add(p);
        return;
      }
      sig = next;
      const focus = captureFocus(el);
      const c = build(el);
      if (Array.isArray(c)) fill(el, ...c);
      else fill(el, c);
      restoreFocus(el, focus);
    },
  };
  return p;
}

interface FocusInfo {
  path: number[];
  tag: string;
  start: number | null;
  end: number | null;
}

function captureFocus(root: Element): FocusInfo | null {
  const a = document.activeElement;
  if (!a || a === root || !root.contains(a)) return null;
  const path: number[] = [];
  let n: Element = a;
  while (n !== root && n.parentElement) {
    path.unshift(Array.prototype.indexOf.call(n.parentElement.children, n));
    n = n.parentElement;
  }
  let start: number | null = null;
  let end: number | null = null;
  if (a instanceof HTMLInputElement && (a.type === "text" || a.type === "search")) {
    start = a.selectionStart;
    end = a.selectionEnd;
  }
  return { path, tag: a.tagName, start, end };
}

function restoreFocus(root: Element, f: FocusInfo | null) {
  if (!f) return;
  let n: Element | undefined = root;
  for (const i of f.path) {
    n = n?.children[i];
    if (!n) return;
  }
  if (!n || n.tagName !== f.tag || !(n instanceof HTMLElement)) return;
  n.focus({ preventScroll: true });
  if (n instanceof HTMLInputElement && f.start !== null && n.type === "text") {
    const len = n.value.length;
    try {
      n.setSelectionRange(Math.min(f.start, len), Math.min(f.end ?? f.start, len));
    } catch {
      /* not selectable */
    }
  }
}
