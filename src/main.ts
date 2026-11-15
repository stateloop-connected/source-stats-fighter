import "./style.css";
import { h } from "./ui/dom";
import { activeMission, enterMission, onContextChange, state, subscribe, MISSION_COUNT } from "./ui/state";
import { renderSetup, resetSetup } from "./ui/setup";
import { renderSimulation, resetSimulation } from "./ui/simulation";
import { battleScreen, showBattle, hideBattle, resetBattle, battleOver } from "./ui/battle";
import { renderHowTo } from "./ui/howto";
import { renderStart, renderBriefing, renderEnd, type View } from "./ui/campaign";
import { isOver, standing } from "./engine/campaign";
import { RANKS } from "./engine/inquiry";
import { art } from "./ui/art";

const VIEWS: View[] = ["start", "briefing", "setup", "simulation", "battle", "howto", "end"];

const app = document.getElementById("app")!;
const nav = h("nav", { class: "tabs" });
const ctxBar = h("div", { class: "ctx-bar" });
const panes = Object.fromEntries(VIEWS.map((v) => [v, h("main", { class: "pane", "data-view": v })])) as Record<View, HTMLElement>;

let current: View = initialView();

function initialView(): View {
  const v = location.hash.slice(1) as View;
  if (!VIEWS.includes(v)) return "start";
  if (v === "briefing" && !activeMission()) return "start";
  if (v === "end" && !state.campaign?.record.length) return "start";
  return v;
}

function tabsFor(): { id: View; label: string }[] {
  if (current === "start" || current === "end") return [];
  if (state.ctx === "mission")
    return [
      { id: "briefing", label: "Briefing" },
      { id: "setup", label: "Setup" },
      { id: "simulation", label: "Simulation" },
      { id: "battle", label: "Battle" },
      { id: "howto", label: "How to play" },
    ];
  return [
    { id: "setup", label: "Setup" },
    { id: "simulation", label: "Simulation" },
    { id: "battle", label: "Battle" },
    { id: "howto", label: "How to play" },
  ];
}

function renderNav() {
  const m = activeMission();
  const menu = h("button", { class: "tab menu-btn", onClick: () => go("start") }, "☰ Menu");
  nav.replaceChildren(...(current === "start" ? [] : [menu]), ...tabsFor().map((t) => h("button", { class: t.id === current ? "tab active" : "tab", onClick: () => go(t.id) }, t.label)));
  ctxBar.replaceChildren(
    current === "start"
      ? ""
      : current === "end"
        ? h("span", null, "Campaign · service record")
        : m
          ? h("span", { class: "ctx-mission" }, rankBadge(), h("span", { class: "dim" }, `Campaign · mission ${m.number} of ${MISSION_COUNT} · `), h("strong", null, m.title))
          : h("span", null, h("span", { class: "dim" }, "Free training · "), h("strong", null, state.scenario.name)),
  );
}

/**
 * The commander's rank insignia and name, for the context bar. While the current mission's battle
 * has not been shown to its end, the board's verdict on it is left out, so the badge does not give
 * the result away.
 */
function rankBadge() {
  const c = state.campaign;
  const m = activeMission();
  const hide = !!c && !!m && c.phase === "launched" && !battleOver();
  const shown = c && hide ? { ...c, record: c.record.filter((x) => x.missionId !== m!.id) } : c;
  const r = RANKS[shown ? standing(shown).rank : 0] ?? RANKS[0];
  return h("span", { class: "rank-badge", title: `Your rank: ${r.name}` }, art(r.insignia, 32, 32, { fallback: "insignia", maxScale: 1, minScale: 1, class: "insignia tiny" }), h("span", null, r.name), h("span", { class: "dim" }, " · "));
}

function renderCurrent() {
  if (current === "setup") renderSetup(panes.setup);
  else if (current === "simulation") renderSimulation(panes.simulation);
  else if (current === "howto") renderHowTo(panes.howto);
  else if (current === "start") renderStart(panes.start, go);
  else if (current === "briefing") renderBriefing(panes.briefing, go);
  else if (current === "end") renderEnd(panes.end, go);
}

function go(v: View) {
  if (current === "battle" && v !== "battle") hideBattle();
  // the briefing needs the current mission's workspace
  if (v === "briefing" && !activeMission()) {
    if (state.campaign && !isOver(state.campaign)) enterMission();
    else v = state.campaign && isOver(state.campaign) ? "end" : "start";
  }
  current = v;
  history.replaceState(null, "", `#${v}`);
  for (const x of VIEWS) panes[x].hidden = x !== v;
  renderNav();
  renderCurrent();
  if (v === "battle") showBattle();
  window.scrollTo({ top: 0 });
}

onContextChange(() => {
  resetSetup();
  resetSimulation();
  resetBattle();
});

app.append(
  h(
    "header",
    { class: "top" },
    h("h1", null, "ALPHA WARS ", h("span", { class: "year" }, "’89")),
    h("span", { class: "tagline" }, "Planetary Defence Command · Tactical Terminal"),
    ctxBar,
    nav,
  ),
  ...VIEWS.map((v) => panes[v]),
  h("footer", null, "Alpha Wars ’89 · version 0.3 · progress is stored in this browser only · a game, not a tool for planning trials: no warranty on its calculations"),
);
battleScreen(panes.battle, {
  onContinue: (next) => go(next),
});
subscribe(() => {
  renderNav();
  if (current !== "start" && current !== "end") renderCurrent();
});
window.addEventListener("hashchange", () => {
  const v = location.hash.slice(1) as View;
  if (VIEWS.includes(v) && v !== current) go(v);
});
go(current);
