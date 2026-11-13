import { h } from "./dom";

export function renderHowTo(root: HTMLElement) {
  if (root.childElementCount) return;
  root.replaceChildren(
    h(
      "section",
      { class: "panel prose" },
      h("h2", null, "How to play"),
      h(
        "p",
        null,
        "An alien fleet approaches in a series of formations. Each formation sends one ship of every class down each cannon's lane. Your job: stop enough ships of each class to meet Command's goals, counted over all lanes, with as little energy as possible. The briefing on the Setup screen states the goals.",
      ),
      h("h3", null, "1. Setup"),
      h(
        "ul",
        null,
        h(
          "li",
          null,
          h("strong", null, "Energy. "),
          "Give each cannon and Ground Control energy. More energy means a stronger impact on average. Ground Control tracks for every cannon, so a strong cannon with weak tracking still hits weakly.",
        ),
        h(
          "li",
          null,
          h("strong", null, "Targets and drones. "),
          "Every cannon–class combination is a target, shown as a circle: ship classes are rows, cannons are columns. Drones on a target weaken its shield. A target without drones has an unbreakable shield. Command fixes the size of the swarm.",
        ),
        h(
          "li",
          null,
          h("strong", null, "Wormholes. "),
          "When a target falls, its drones fly on through the wormholes you laid out and weaken other shields. A good network causes chain reactions; a poor one leaves drones stranded on a target that never falls. Drag a wormhole's label to bend it out of the way.",
        ),
      ),
      h("p", null, "Intelligence rates each weapon against each class. It may be wrong, and some weapons may not work at all against some classes."),
      h("h3", null, "2. Simulation"),
      h(
        "p",
        null,
        "Rehearse the battle many times under an assumption (intelligence, a pessimistic reading of it, or your own numbers) and see how often each goal is met. Save designs in Setup and compare them side by side. The “?” beside each heading explains what is counted.",
      ),
      h("h3", null, "3. Battle"),
      h(
        "p",
        null,
        "Launch the battle against the real enemy. In each formation the cannons fire at every ship in their lane. A ship falls when the impact beats its shield; its drones then fly on, the cannons fire again, and further ships may fall. Ships without drones absorb the beam. Survivors fly on to the planet.",
      ),
      h(
        "p",
        null,
        "The stats panel beside the battlefield shows, for every ship, the impact against the shield. Each impact has two parts: what the cannon delivered, and what Ground Control's tracking added or took away. Ground Control's reticles sit off-centre by the same amount on every ship of a class: when tracking is off for a class, it is off for every cannon.",
      ),
      h(
        "p",
        null,
        "Win all primary goals and scavengers analyse the wreckage, revealing the true effectiveness of your weapons and how likely your design was to win. Lose, and you only have what you observed.",
      ),
      h("h3", null, "False kills"),
      h(
        "p",
        null,
        "Drones report kills, and against a class a weapon cannot hurt they will now and then report one anyway. Command limits the swarm so that this happens in at most the swarm size (2.5% by default) of formations, whatever network you draw.",
      ),
      h("h3", null, "Under the hood"),
      h(
        "p",
        null,
        "For statisticians: each formation is one trial. Cannons are treatment arms, Ground Control a shared control, energy is sample size, targets are hypotheses, the impact is the z statistic, the shield is the critical value, the swarm is α, drone shares are the initial weights, and wormholes the transition matrix of a Bonferroni-based graphical procedure (Bretz et al. 2009). The cannon's and the tracking part of an impact are the treatment and control contributions to the statistic; the shared control makes statistics for the same class correlated (0.5 with equal energy). The share of a class stopped over all lanes is the average power of that class's hypotheses. Export your design to R (gMCP, graphicalMCP) or TikZ in the Setup tab.",
      ),
    ),
  );
}
