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
      h("h3", null, "Campaign and free training"),
      h(
        "p",
        null,
        "A campaign is a run of missions, each adding one idea. Every mission starts with a briefing, then you plan in Setup and rehearse in Simulation. Launching the battle is final: each battle is fought once, and the run moves on whether it was won or lost. Early missions keep some controls closed until they are needed, and the chief scientist leaves a few hints that you can dismiss. Free training is the open workbench: every control, any scenario, as many battles as you like. Missions fought in a run can be loaded into free training to study them.",
      ),
      h(
        "p",
        null,
        "From mission 4 the range reports are classified: you plan on intelligence, which gives a best guess and a range, and the simulator runs on intelligence too. Part of the truth changes from run to run within what intelligence states, so a second run cannot be won from memory. In missions 6 and 8 simulator time is rationed: a small run gives a rough answer with wide whiskers, a precise one uses more of the allowance, and each design in a comparison costs the full number of battles.",
      ),
      h("h3", null, "The board of inquiry and your rank"),
      h(
        "p",
        null,
        "After every campaign battle a board of inquiry works out how often your design would have won under the true effects, and compares it with the reference design of your rival, Commander Hollister. A plan as good as his, or close, earns a commendation; a fair plan that wins is credited; a win on a plan that would usually have lost earns nothing. A loss on a sound plan carries no blame, but a loss on a weak plan costs merit. Secondary goals met and energy left unspent earn extra merit, but only when the primary goals were met. Merit counts more on harder missions. Enough merit brings promotion, from Ensign up to Admiral; falling well short of your rank costs it. The exact odds are shown only after a win, once the wreckage has been analysed. The service record lists every mission with its verdict, energy used and the rival's odds.",
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
        "Launch the battle against the real enemy. Each formation flies in, and Ground Control launches your drones to their ships. The ring around a ship is its shield: a full ring with an outer circle cannot be broken, and the shorter the ring, the weaker the shield. Drones drain it as they arrive. The cannons then fire an energy bolt at every ship in their lane that holds drones. A ship falls when the impact beats its shield; its drones then fly on, the cannons fire again, and further ships may fall. A ship without drones cannot fall, so it is not fired at until drones reach it through a wormhole. Survivors bomb the planet and fly off; other defences will have to deal with them.",
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
