import type { FormationResult } from "../engine/battle";

/**
 * What happens in one formation, as a list of timed segments, and the state of the board at any moment.
 * No drawing here: the battlefield and the stats panel both read a Moment.
 *
 * Order: the formation arrives; Ground Control launches the drones to their ships; the cannons fire; if a target's impact beats its shield it falls and
 * its drones fly through the wormholes; the cannons fire again; ... until nothing more falls. Then the
 * surviving ships fly on to the planet.
 */
export type Seg =
  | { kind: "arrive"; dur: number }
  | { kind: "deploy"; dur: number }
  | { kind: "fire"; round: number; dur: number }
  | { kind: "fall"; step: number; dur: number }
  | { kind: "travel"; step: number; dur: number }
  | { kind: "resolve"; dur: number }
  | { kind: "pause"; dur: number };

export const DUR = { arrive: 900, deploy: 1100, fire: 700, fall: 550, travel: 900, resolve: 1900, pause: 300 };

export function timeline(fr: FormationResult): Seg[] {
  const segs: Seg[] = [{ kind: "arrive", dur: DUR.arrive }, { kind: "deploy", dur: DUR.deploy }];
  fr.steps.forEach((st, i) => {
    segs.push({ kind: "fire", round: i, dur: DUR.fire }, { kind: "fall", step: i, dur: DUR.fall });
    if (st.released.length || st.lost > 1e-12) segs.push({ kind: "travel", step: i, dur: DUR.travel });
  });
  segs.push({ kind: "fire", round: fr.steps.length, dur: DUR.fire }, { kind: "resolve", dur: DUR.resolve }, { kind: "pause", dur: DUR.pause });
  return segs;
}

export const totalDuration = (segs: Seg[]) => segs.reduce((s, x) => s + x.dur, 0);

/** Fraction of a fire segment at which beams hit and impacts are revealed. */
export const HIT_AT = 0.45;

/**
 * Deployment: drone j of n (0-based) is at progress clamp(2q − j/n) on its way from Ground Control, so
 * the first half of the segment is flight and the swarm settles on its ship during the second half.
 */
export const deployProgress = (q: number, j: number, n: number) => Math.max(0, Math.min(1, 2 * q - j / Math.max(1, n)));
/** Share of each swarm that has reached its ship. */
export const deployed = (q: number) => Math.max(0, Math.min(1, 2 * q - 1));

export interface Flight {
  from: number;
  to: number;
  amount: number;
  q: number;
}

export interface Moment {
  seg: Seg;
  segIndex: number;
  /** Progress through the current segment, 0..1. */
  q: number;
  /** Drone share shown on each target. */
  weights: number[];
  /** Drone share at the start of the current segment (the shields drain from these). */
  weightsFrom: number[];
  /** The drones as set up, before they are launched. */
  initial: number[];
  /** Targets whose ship has fallen (including the one exploding now). */
  fallen: boolean[];
  exploding: number | null;
  /**
   * Ships being fired at in the current fire segment: standing, the cannon has energy, and the ship
   * holds drones. Cannons do not fire at ships without drones; those are fired at in the first round
   * after drones arrive through a wormhole.
   */
  firedAt: boolean[];
  /** Impact shown: the ship was fired at (it had drones when a beam hit it). */
  revealed: boolean[];
  flights: Flight[];
  /** Drones lost in the current travel segment (share of the swarm). */
  lost: number;
  /** 0 while the formation flies in, 1 when in position. */
  arrive: number;
  /** 0 until Ground Control launches the drones, 1 once every swarm has reached its ship. */
  deploy: number;
  /** 0 until the survivors fly on, rising evenly to 1 when they have bombed the planet and left. */
  leave: number;
  /** The formation's result counts in the tally from the resolve segment on. */
  counted: boolean;
}

const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

export function momentAt(fr: FormationResult, w0: number[], segs: Seg[], t: number): Moment {
  const m = w0.length;
  const canFire = fr.shots.map((z) => Number.isFinite(z));
  // no drones until Ground Control launches them
  let weights = new Array<number>(m).fill(0);
  const fallen = new Array<boolean>(m).fill(false);
  const revealed = new Array<boolean>(m).fill(false);
  const target = (i: number) => !fallen[i] && canFire[i] && weights[i] > 0;
  const hit = () => {
    for (let i = 0; i < m; i++) if (target(i)) revealed[i] = true;
  };
  let acc = 0;
  let idx = segs.length - 1;
  let q = 1;
  for (let s = 0; s < segs.length; s++) {
    const seg = segs[s];
    if (t < acc + seg.dur) {
      idx = s;
      q = seg.dur > 0 ? Math.max(0, (t - acc) / seg.dur) : 1;
      break;
    }
    acc += seg.dur;
    // segment fully passed
    if (seg.kind === "fire") hit();
    else if (seg.kind === "fall") fallen[fr.steps[seg.step].target] = true;
    else if (seg.kind === "deploy") weights = w0.slice();
    else if (seg.kind === "travel") weights = fr.steps[seg.step].weightsAfter.slice();
  }
  const weightsFrom = weights.slice();
  const seg = segs[idx];
  let exploding: number | null = null;
  let flights: Flight[] = [];
  let lost = 0;
  const firedAt = new Array<boolean>(m).fill(false);
  if (seg.kind === "fire") {
    for (let i = 0; i < m; i++) firedAt[i] = target(i);
    if (q >= HIT_AT) hit();
  } else if (seg.kind === "fall") {
    exploding = fr.steps[seg.step].target;
    fallen[exploding] = true;
  } else if (seg.kind === "deploy") {
    const f = deployed(q);
    weights = w0.map((w) => w * f);
  } else if (seg.kind === "travel") {
    const st = fr.steps[seg.step];
    const e = ease(q);
    weights = weights.map((w, i) => w + (st.weightsAfter[i] - w) * e);
    flights = st.released.map((r) => ({ from: st.target, to: r.to, amount: r.amount, q }));
    lost = st.lost;
  }
  const resolveIndex = segs.findIndex((x) => x.kind === "resolve");
  return {
    seg,
    segIndex: idx,
    q,
    weights,
    weightsFrom,
    initial: w0.slice(),
    fallen,
    exploding,
    firedAt,
    revealed,
    flights,
    lost,
    arrive: seg.kind === "arrive" ? ease(q) : 1,
    deploy: seg.kind === "arrive" ? 0 : seg.kind === "deploy" ? q : 1,
    leave: seg.kind === "resolve" ? q : seg.kind === "pause" ? 1 : 0,
    counted: idx >= resolveIndex,
  };
}
