import { h } from "./dom";
import { art } from "./art";
import { activeMission, dismissHint, state } from "./state";
import { CHARACTERS, type HintAnchor } from "../engine/missions";

/** Hints of the current mission at this place that have not been dismissed (for panel deps). */
export function openHints(anchor: HintAnchor) {
  const m = activeMission();
  if (!m) return [];
  const gone = state.campaign?.hintsDismissed ?? [];
  return m.hints.filter((x) => x.anchor === anchor && !gone.includes(x.id));
}

/** The chief scientist's hints for a place in Setup or Simulation, each dismissible. */
export function hints(anchor: HintAnchor): HTMLElement[] {
  const who = CHARACTERS.scientist;
  return openHints(anchor).map((x) =>
    h(
      "aside",
      { class: "hint-card", role: "note" },
      art(who.portrait, 96, 96, { fallback: "portrait", maxScale: 1, minScale: 1, class: "hint-portrait" }),
      h("div", { class: "hint-body" }, h("div", { class: "hint-who" }, who.name), h("p", null, x.text)),
      h("button", { class: "small hint-close", title: "Dismiss this hint", "aria-label": "Dismiss hint", onClick: () => dismissHint(x.id) }, "✕"),
    ),
  );
}
