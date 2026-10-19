import { PENALTIES_PER_SIDE, PENALTY_CONVERSION, type PositionGroup } from "../../engine/match.js";
import type { SimPlayer } from "../gameState.js";
import { exp } from "../portableMath.js";

/** How a goal went in. An own goal counts for `clubId`; its `playerId` is the opponent who put it in. */
export type GoalKind = "openPlay" | "header" | "penalty" | "freeKick" | "ownGoal" | "olympic";

export type GoalEvent = { type: "goal"; minute: number; clubId: string; playerId: string; kind?: GoalKind; assistId?: string };
export type PenaltyMiss = { type: "penaltyMiss"; minute: number; clubId: string; playerId: string; keeperId: string; isSaved: boolean };

// ESPN's public match summaries (keyEvents) of the 760 Série A matches of 2024 and 2025, fetched
// 2026-10-15: of 1,889 goals, 166 were penalties, 344 headers, 42 own goals and 39 direct free kicks;
// 956 of the 1,298 other goals and 315 of the headers came with an assist. Of the 46 penalties not
// scored, 39 were saved.
const GOALS = 1889;
const PENALTY_SHARE = 166 / GOALS;
const HEADER_SHARE = 344 / GOALS;
const OWN_GOAL_SHARE = 42 / GOALS;
const FREE_KICK_SHARE = 39 / GOALS;
const ASSISTED_OPEN_PLAY = 956 / 1298;
const ASSISTED_HEADER = 315 / 344;
const SAVED_SHARE = 39 / 46;
// Brasfoot's goal subtypes (c/b.java, ~line 960): 0.5% of goals go in straight from a corner. ESPN does not tag them.
const OLYMPIC_SHARE = 0.005;

// guess: Brasfoot moves its penalty odds up to 15 points either way for the taker's and the keeper's
// traits (a/gb.java:106). Here each strength point the taker has over the keeper adds 0.6 of a point
// to Série A's 78% conversion, kept between 55% and 92%.
const CONVERSION_PER_POINT = 0.006;
const MIN_CONVERSION = 0.55;
const MAX_CONVERSION = 0.92;

/** How likely a penalty goes in, from the taker's and the keeper's strength. */
export function penaltyConversion(takerStrength: number, keeperStrength: number): number {
  return Math.min(MAX_CONVERSION, Math.max(MIN_CONVERSION, PENALTY_CONVERSION + CONVERSION_PER_POINT * (takerStrength - keeperStrength)));
}

// Brasfoot's assist weights by role (c/b.java:800): attacking midfielders 20, wide players and
// forwards 10, defenders 2 to 4. guess for own goals: defenders put most of them in.
const ASSIST_WEIGHT: Record<PositionGroup, number> = { GK: 0, DEF: 4, MID: 20, ATT: 10 };
const OWN_GOAL_WEIGHT: Record<PositionGroup, number> = { GK: 1, DEF: 6, MID: 2, ATT: 1 };

function pick<T>(items: readonly T[], weight: (item: T) => number, random: () => number): T | undefined {
  const total = items.reduce((sum, item) => sum + weight(item), 0);
  if (total <= 0) return items[0];
  let roll = random() * total;
  return items.find((item) => (roll -= weight(item)) < 0) ?? items.at(-1);
}

/** Who takes a side's set pieces: the coach's taker when he is on the pitch, else the strongest forward, else the strongest outfielder. */
export function setPieceTaker(onPitch: readonly SimPlayer[], strength: (p: SimPlayer) => number, chosenId: string | null): SimPlayer | undefined {
  const chosen = onPitch.find((p) => p.id === chosenId);
  if (chosen) return chosen;
  const byStrength = [...onPitch].sort((a, b) => strength(b) - strength(a));
  return byStrength.find((p) => p.group === "ATT") ?? byStrength.find((p) => p.group !== "GK") ?? byStrength[0];
}

/** Who is in goal: the keeper on the pitch, else whoever stands in for him. */
export function keeperOf(onPitch: readonly SimPlayer[]): SimPlayer | undefined {
  return onPitch.find((p) => p.group === "GK") ?? onPitch.find((p) => p.group === "DEF") ?? onPitch[0];
}

export type GoalSide = {
  clubId: string;
  /** The side's players on the pitch at a minute. */
  onPitch: (minute: number) => readonly SimPlayer[];
  penaltyTakerId: string | null;
};

type Sides = { home: GoalSide; away: GoalSide };

/**
 * Each goal's kind and assist, at Série A's shares. A penalty, free kick or olympic goal goes to the
 * side's set-piece taker, and a penalty is likelier the better he is against the keeper; an own
 * goal goes to an opponent on the pitch. The scorers of the other goals stay as drawn.
 */
export function describeGoals(goals: readonly GoalEvent[], sides: Sides, strength: (p: SimPlayer) => number, random: () => number): GoalEvent[] {
  return goals.map((goal) => {
    const [own, other] = goal.clubId === sides.home.clubId ? [sides.home, sides.away] : [sides.away, sides.home];
    const mates = own.onPitch(goal.minute);
    const opponents = other.onPitch(goal.minute);
    const taker = setPieceTaker(mates, strength, own.penaltyTakerId);
    const keeper = keeperOf(opponents);
    const conversion = taker && keeper ? penaltyConversion(strength(taker), strength(keeper)) : PENALTY_CONVERSION;
    let roll = random();
    const isNext = (share: number) => (roll -= share) < 0;
    if (taker && isNext((PENALTY_SHARE * conversion) / PENALTY_CONVERSION)) return { ...goal, playerId: taker.id, kind: "penalty" };
    if (taker && isNext(FREE_KICK_SHARE)) return { ...goal, playerId: taker.id, kind: "freeKick" };
    const culprit = pick(opponents, (p) => OWN_GOAL_WEIGHT[p.group], random);
    if (culprit && isNext(OWN_GOAL_SHARE)) return { ...goal, playerId: culprit.id, kind: "ownGoal" };
    if (taker && isNext(OLYMPIC_SHARE)) return { ...goal, playerId: taker.id, kind: "olympic" };
    const kind = isNext(HEADER_SHARE) ? "header" : "openPlay";
    const isAssisted = random() < (kind === "header" ? ASSISTED_HEADER : ASSISTED_OPEN_PLAY);
    const assist = isAssisted ? pick(mates.filter((p) => p.id !== goal.playerId), (p) => ASSIST_WEIGHT[p.group], random) : undefined;
    return { ...goal, kind, ...(assist ? { assistId: assist.id } : {}) };
  });
}

/**
 * Penalties a side misses after `from`: as many as Série A misses per match on the rest of it, more
 * when the taker is weaker than the keeper. Each comes at a minute from `drawMinute` and is saved
 * as often as in Série A.
 */
export function drawPenaltyMisses(sides: Sides, strength: (p: SimPlayer) => number, from: number, drawMinute: () => number, random: () => number): PenaltyMiss[] {
  const share = (90 - from) / 90;
  return [missOf(sides.home, sides.away), missOf(sides.away, sides.home)].flatMap((miss) => (miss ? [miss] : []));

  function missOf(own: GoalSide, other: GoalSide): PenaltyMiss | null {
    const minute = drawMinute();
    const taker = setPieceTaker(own.onPitch(minute), strength, own.penaltyTakerId);
    const keeper = keeperOf(other.onPitch(minute));
    if (!taker || !keeper) return null;
    const mean = PENALTIES_PER_SIDE * (1 - penaltyConversion(strength(taker), strength(keeper))) * share;
    if (random() >= 1 - exp(-mean)) return null;
    return { type: "penaltyMiss", minute, clubId: own.clubId, playerId: taker.id, keeperId: keeper.id, isSaved: random() < SAVED_SHARE };
  }
}
