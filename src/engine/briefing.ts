import { goalCount } from "./battle";
import { targetKey, type Intel, type Scenario } from "./model";

export type Rating = "strong" | "moderate" | "weak" | "uncertain";

/** How intelligence describes a weapon against a class. */
export function rate(i: Intel): Rating {
  if (i.low <= 0.15) return "uncertain";
  if (i.guess >= 0.4) return "strong";
  if (i.guess >= 0.25) return "moderate";
  return "weak";
}

const pc = (x: number) => `${Math.round(x * 1000) / 10}%`;

/** "a", "a and b", "a, b and c" */
export function list(xs: string[]): string {
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

/** The briefing in standard sentences, one paragraph per entry. */
export function briefingText(s: Scenario): string[] {
  const C = s.cannons.length;
  const ships = C * s.formations;
  const goal = (k: Scenario["classes"][number]) => `${pc(k.goal)} of the ${k.name} ships`;
  const primary = s.classes.filter((k) => k.primary);
  const secondary = s.classes.filter((k) => !k.primary && k.goal > 0);
  const out: string[] = [];

  const g: string[] = [];
  if (primary.length === 0) g.push("Command has set no primary goal.");
  else g.push(`Your primary goal${primary.length > 1 ? "s are" : " is"} to stop at least ${list(primary.map(goal))}.`);
  if (secondary.length) g.push(`Secondary goal${secondary.length > 1 ? "s" : ""}: stop at least ${list(secondary.map(goal))}.`);
  g.push(primary.length ? "The battle is won if every primary goal is met." : "The battle cannot be lost, but secondary goals still count.");
  out.push(g.join(" "));

  const need = primary.map((k) => `${goalCount(k.goal, ships)} ${k.name}`);
  out.push(
    `${s.formations} formation${s.formations === 1 ? " is" : "s are"} expected. Each formation sends one ship of every class against each of your ${C === 1 ? "cannon" : `${C} cannons`}, so ${ships} ships of each class will come${need.length ? `; you must stop ${list(need)} ships` : ""}.`,
  );

  out.push(
    `You have ${s.energyAvailable} units of energy to share between your cannons and Ground Control. Command limits the drone swarm to ${pc(s.alpha)}, so that false kills stay rare.`,
  );

  const order: Rating[] = ["strong", "moderate", "weak", "uncertain"];
  const intel = s.cannons.map((c) => {
    const by = new Map<Rating, string[]>();
    for (const k of s.classes) {
      const r = rate(s.intel[targetKey(c.id, k.id)] ?? { guess: 0, low: 0, high: 0 });
      by.set(r, [...(by.get(r) ?? []), k.name]);
    }
    const parts = order.filter((r) => by.has(r)).map((r) => `${r} against ${list(by.get(r)!)} ships`);
    return `Intelligence rates the ${c.name} as ${list(parts)}.`;
  });
  out.push(`${intel.join(" ")}${s.hideTruth ? " Intelligence may be wrong." : " The true effectiveness is declassified for this scenario."}`);
  return out;
}
