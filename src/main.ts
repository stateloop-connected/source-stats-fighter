import "./style.css";
import { h } from "./ui/dom";
import { subscribe } from "./ui/state";
import { renderSetup } from "./ui/setup";
import { renderSimulation } from "./ui/simulation";
import { battleScreen, showBattle, hideBattle } from "./ui/battle";
import { renderHowTo } from "./ui/howto";

type Tab = "setup" | "simulation" | "battle" | "howto";
const TABS: { id: Tab; label: string }[] = [
  { id: "setup", label: "Setup" },
  { id: "simulation", label: "Simulation" },
  { id: "battle", label: "Battle" },
  { id: "howto", label: "How to play" },
];

const app = document.getElementById("app")!;
const nav = h("nav", { class: "tabs" });
const panes = Object.fromEntries(TABS.map((t) => [t.id, h("main", { class: "pane", "data-tab": t.id })])) as Record<Tab, HTMLElement>;

let current: Tab = ((): Tab => {
  const fromHash = location.hash.slice(1) as Tab;
  return TABS.some((t) => t.id === fromHash) ? fromHash : "setup";
})();

function renderNav() {
  nav.replaceChildren(...TABS.map((t) => h("button", { class: t.id === current ? "tab active" : "tab", onClick: () => show(t.id) }, t.label)));
}

function renderCurrent() {
  if (current === "setup") renderSetup(panes.setup);
  else if (current === "simulation") renderSimulation(panes.simulation);
  else if (current === "howto") renderHowTo(panes.howto);
}

function show(tab: Tab) {
  if (current === "battle" && tab !== "battle") hideBattle();
  current = tab;
  history.replaceState(null, "", `#${tab}`);
  for (const t of TABS) panes[t.id].hidden = t.id !== tab;
  renderNav();
  renderCurrent();
  if (tab === "battle") showBattle();
}

app.append(
  h("header", { class: "top" }, h("h1", null, "ALPHA WARS ", h("span", { class: "year" }, "’89")), h("span", { class: "tagline" }, "Planetary Defence Command · Tactical Terminal"), nav),
  ...TABS.map((t) => panes[t.id]),
  h("footer", null, "Alpha Wars ’89 · MVP · designs are stored in this browser only"),
);
battleScreen(panes.battle);
subscribe(() => renderCurrent());
window.addEventListener("hashchange", () => {
  const t = location.hash.slice(1) as Tab;
  if (TABS.some((x) => x.id === t) && t !== current) show(t);
});
show(current);
