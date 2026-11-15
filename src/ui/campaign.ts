import { h, pct } from "./dom";
import { art } from "./art";
import { activeMission, enterFree, enterMission, MISSION_COUNT, setPhase, startNewCampaign, state, studyMission, STUDY_QUESTION } from "./state";
import { CHARACTERS } from "../engine/missions";
import { missions } from "../engine/missions";
import { isOver, standing } from "../engine/campaign";
import { RANKS, VERDICT_TEXT } from "../engine/inquiry";
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
        c && c.record.length ? h("button", { onClick: () => go("end") }, isOver(c) ? "Last run's service record" : "Service record") : null,
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
      m.intelReport?.length
        ? h(
            "div",
            { class: "speaker" },
            art(CHARACTERS.intel.portrait, 96, 96, { fallback: "portrait", maxScale: 2, class: "portrait" }),
            h(
              "div",
              { class: "speech" },
              h("div", { class: "who" }, CHARACTERS.intel.name, h("span", { class: "dim" }, ` · ${CHARACTERS.intel.role}`)),
              m.intelReport.map((t) => h("p", null, t)),
            ),
          )
        : null,
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

/* ---------------- service record ---------------- */

export function renderEnd(root: HTMLElement, go: Go) {
  const c = state.campaign;
  const all = missions();
  const over = !!c && isOver(c);
  const st = c ? standing(c) : { merit: 0, rank: 0 };
  const rank = RANKS[st.rank];
  const next = RANKS[st.rank + 1];
  const rows = (c?.record ?? []).map((r) => {
    const m = all.find((x) => x.id === r.missionId);
    const q = r.inquiry;
    const delta = q ? q.after.merit - q.before.merit : 0;
    return h(
      "tr",
      null,
      h("td", null, m ? `${m.number}. ${m.title}` : r.missionId),
      h("td", { class: r.won ? "ok" : "bad" }, r.won ? "won" : "lost"),
      h("td", null, q ? VERDICT_TEXT[q.verdict].title : h("span", { class: "dim" }, "pending")),
      h("td", { class: delta > 0 ? "ok" : delta < 0 ? "bad" : "dim" }, q ? `${delta > 0 ? "+" : ""}${delta}` : "–"),
      h("td", null, `${r.energyUsed} / ${r.scenario.energyAvailable}`),
      h("td", null, q ? pct(q.rivalOdds) : "–"),
      h(
        "td",
        null,
        h(
          "button",
          {
            class: "small",
            title: "Open this mission in free training to study it",
            onClick: () => {
              if (!confirm(STUDY_QUESTION)) return;
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
  const n = c?.record.length ?? 0;
  const closing = !over
    ? `The run is in progress: ${n} of ${MISSION_COUNT} missions fought.`
    : st.rank === RANKS.length - 1
      ? "The board has nothing left to give you. Admiral."
      : `The run is complete. ${won} of ${n} battles won. The rank of ${RANKS[RANKS.length - 1].name} remains for a run that is planned even better.`;
  root.replaceChildren(
    h(
      "section",
      { class: "panel" },
      h("h2", null, over ? "Service record — end of the run" : "Service record"),
      over ? art("campaign-end", 320, 200, { fallback: "horizon", maxScale: 2, class: "mission-art" }) : art("record", 320, 120, { fallback: "space", maxScale: 3, class: "mission-art" }),
      h(
        "div",
        { class: "rank-head" },
        art(rank.insignia, 32, 32, { fallback: "insignia", maxScale: 2, minScale: 2, class: "insignia" }),
        h("div", null, h("div", { class: "rank-name" }, rank.name), h("div", { class: "dim small" }, `Merit ${st.merit}${next ? ` · ${next.name} at ${next.merit}` : ""}`)),
      ),
      h("p", null, n ? closing : "No battles fought yet."),
      n
        ? h(
            "div",
            { class: "scroll-x" },
            h(
              "table",
              { class: "grid" },
              h("tr", null, h("th", null, "Mission"), h("th", null, "Result"), h("th", null, "Verdict"), h("th", null, "Merit"), h("th", null, "Energy"), h("th", null, "Rival’s odds"), h("th", null, "")),
              rows,
            ),
          )
        : null,
      h("p", { class: "dim small" }, "Rival’s odds: how often Commander Hollister’s reference design would have won the battle as it was fought. Study opens a mission in free training without touching the record."),
      h(
        "div",
        { class: "row" },
        !over && c ? h("button", { class: "primary", onClick: () => { enterMission(); go(c.phase === "briefing" ? "briefing" : c.phase === "launched" ? "battle" : "setup"); } }, "Back to the campaign") : null,
        h("button", { onClick: () => go("start") }, "Back to the menu"),
      ),
    ),
  );
}
