import { h, pct } from "./dom";
import { art } from "./art";
import { activeMission, enterFree, enterMission, MISSION_COUNT, setPhase, startNewCampaign, state, studyMission } from "./state";
import { CHARACTERS } from "../engine/missions";
import { missions } from "../engine/missions";
import { isOver } from "../engine/campaign";
import { briefingText } from "../engine/briefing";
import { hints } from "./hints";

export type View = "start" | "briefing" | "setup" | "simulation" | "battle" | "howto" | "end";
type Go = (v: View) => void;

/* ---------------- start screen ---------------- */

export function renderStart(root: HTMLElement, go: Go) {
  const c = state.campaign;
  const running = !!c && !isOver(c);
  const m = running ? missions()[c!.index] : null;
  const title = h(
    "div",
    { class: "title-art" },
    art("title", 320, 200, { fallback: "horizon", maxScale: 2, alt: "A cannon on the planet's horizon fires into space at a distant red fleet" }),
    h("div", { class: "title-text" }, h("div", { class: "title-name" }, "ALPHA WARS ", h("span", { class: "year" }, "’89")), h("div", { class: "title-sub" }, "Planetary Defence Command")),
  );
  const cont = () => {
    enterMission();
    go(c!.phase === "briefing" ? "briefing" : c!.phase === "launched" ? "battle" : "setup");
  };
  const fresh = () => {
    if (c && c.record.length && !confirm("Start a new campaign? The current run and its record are closed.")) return;
    startNewCampaign();
    go("briefing");
  };
  root.replaceChildren(
    h(
      "section",
      { class: "start" },
      title,
      h(
        "div",
        { class: "menu" },
        running ? h("button", { class: "primary", onClick: cont }, "Continue campaign", h("span", { class: "dim small" }, ` — mission ${c!.index + 1}: ${m!.title}`)) : null,
        h("button", { class: running ? "" : "primary", onClick: fresh }, "New campaign"),
        c && isOver(c) ? h("button", { onClick: () => go("end") }, "Last run's record") : null,
        h(
          "button",
          {
            onClick: () => {
              enterFree();
              go("setup");
            },
          },
          "Free training",
        ),
        h("button", { onClick: () => go("howto") }, "How to play"),
      ),
      h(
        "p",
        { class: "dim small c" },
        `${MISSION_COUNT} missions are ready. Each battle in a campaign is fought once; the run moves on whether it is won or lost. Free training has no such limits.`,
      ),
    ),
  );
}

/* ---------------- mission briefing ---------------- */

export function renderBriefing(root: HTMLElement, go: Go) {
  const m = activeMission();
  if (!m) {
    root.replaceChildren(h("section", { class: "panel" }, h("p", null, "No mission is active."), h("button", { onClick: () => go("start") }, "Back to the menu")));
    return;
  }
  const co = CHARACTERS.commander;
  const fought = state.campaign!.phase === "launched";
  root.replaceChildren(
    h(
      "section",
      { class: "panel briefing-screen" },
      h("div", { class: "mission-head" }, h("span", { class: "mission-no" }, `MISSION ${m.number} OF ${MISSION_COUNT}`), h("h2", null, m.title)),
      art(m.art, 320, 120, { fallback: m.number % 2 ? "horizon" : "fleet", maxScale: 3, class: "mission-art" }),
      h(
        "div",
        { class: "speaker" },
        art(co.portrait, 96, 96, { fallback: "portrait", maxScale: 2, class: "portrait" }),
        h("div", { class: "speech" }, h("div", { class: "who" }, co.name, h("span", { class: "dim" }, ` · ${co.role}`)), m.briefing.map((t) => h("p", null, t))),
      ),
      h("h3", null, "Orders"),
      h("div", { class: "briefing" }, briefingText(state.scenario).map((t) => h("p", null, t))),
      hints("briefing"),
      h(
        "div",
        { class: "row" },
        h(
          "button",
          {
            class: "primary",
            onClick: () => {
              if (!fought) setPhase("planning");
              go(fought ? "battle" : "setup");
            },
          },
          fought ? "To the battle report" : "Begin planning",
        ),
      ),
    ),
  );
}

/* ---------------- end of the run ---------------- */

export function renderEnd(root: HTMLElement, go: Go) {
  const c = state.campaign;
  const all = missions();
  const rows = (c?.record ?? []).map((r) => {
    const m = all.find((x) => x.id === r.missionId);
    return h(
      "tr",
      null,
      h("td", null, m ? `${m.number}. ${m.title}` : r.missionId),
      h("td", { class: r.won ? "ok" : "bad" }, r.won ? "won" : "lost"),
      h("td", null, `${r.energyUsed} / ${r.scenario.energyAvailable}`),
      h("td", null, r.scenario.classes.map((k, i) => `${k.name} ${r.tally[i] ?? 0}/${r.scenario.cannons.length * r.scenario.formations}`).join(", ")),
      h(
        "td",
        null,
        h(
          "button",
          {
            class: "small",
            title: "Open this mission in free training to study it",
            onClick: () => {
              studyMission(r.missionId);
              enterFree();
              go("setup");
            },
          },
          "Study",
        ),
      ),
    );
  });
  const won = (c?.record ?? []).filter((r) => r.won).length;
  root.replaceChildren(
    h(
      "section",
      { class: "panel" },
      h("h2", null, "End of the run"),
      art("record", 320, 120, { fallback: "space", maxScale: 3, class: "mission-art" }),
      h(
        "p",
        null,
        c && c.record.length
          ? `${won} of ${c.record.length} battles won (${pct(won / c.record.length)}). The introduction is complete. Further missions are in preparation at Command.`
          : "No battles fought yet.",
      ),
      h(
        "table",
        { class: "grid" },
        h("tr", null, h("th", null, "Mission"), h("th", null, "Result"), h("th", null, "Energy"), h("th", null, "Ships stopped"), h("th", null, "")),
        rows,
      ),
      h("div", { class: "row" }, h("button", { onClick: () => go("start") }, "Back to the menu")),
    ),
  );
}
