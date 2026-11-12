import { h } from "./dom";

export function renderHowTo(root: HTMLElement) {
  root.replaceChildren(
    h(
      "section",
      { class: "panel prose" },
      h("h2", null, "How to play"),
      h("p", null, "An alien fleet approaches in a long series of identical formations. Each formation has one ship of every class. Your job: stop enough ships of each class to meet Command's goals, with as little energy as possible."),
      h("h3", null, "1. Setup"),
      h(
        "ul",
        null,
        h("li", null, h("strong", null, "Energy. "), "Give each cannon and Ground Control energy. More energy means stronger shots on average. Ground Control tracks for every cannon, so a strong cannon with weak tracking still hits weakly."),
        h("li", null, h("strong", null, "Drones. "), "Every cannon–class combination is a target. Drones on a target weaken its shield. A target without drones cannot fall. Command fixes the size of the swarm."),
        h("li", null, h("strong", null, "Wormholes. "), "When a target falls, its drones fly on through the wormholes you laid out and weaken other shields. A good network causes chain reactions; a poor one leaves drones stranded on a target that never falls."),
      ),
      h("p", null, "Intelligence tells you how effective each weapon is believed to be. It may be wrong. Some weapons may not work at all against some classes."),
      h("h3", null, "2. Simulation"),
      h("p", null, "Rehearse the battle many times under an assumption — intelligence, a pessimistic reading of it, or your own numbers — and see how often each goal is met. Save designs in Setup and compare them side by side."),
      h("h3", null, "3. Battle"),
      h("p", null, "Launch the battle against the real enemy. For each formation the cannons fire, any shot stronger than its target's shield breaks through, drones travel along the wormholes, and further targets may fall. A ship is stopped if any cannon breaks through against its class. The tally shows how you stand against each goal."),
      h("p", null, "Win all primary goals and scavengers analyse the wreckage, revealing the true effectiveness of your weapons and how likely your design was to win. Lose, and you only have what you observed."),
      h("h3", null, "False kills"),
      h("p", null, "Drones report kills, and against a class a weapon cannot hurt they will now and then report one anyway. Command limits the swarm so that this happens in at most the swarm size (2.5% by default) of formations, whatever network you draw."),
      h("h3", null, "Under the hood"),
      h(
        "p",
        null,
        "For statisticians: each formation is one trial. Cannons are treatment arms, Ground Control a shared control, energy is sample size, targets are hypotheses, shot strength is the z statistic, shield strength the critical value, the swarm is α, drone shares are the initial weights, wormholes the transition matrix of a Bonferroni-based graphical procedure (Bretz et al. 2009). Share of a class stopped over the battle is empirical power. Export your design to R (gMCP, graphicalMCP) or TikZ in the Setup tab.",
      ),
    ),
  );
}
