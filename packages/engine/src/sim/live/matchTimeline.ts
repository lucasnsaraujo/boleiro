import type { Score } from "../../engine/match.js";
import { keyedStream } from "../../engine/random.js";
import { scoringFactor } from "../../engine/sendOffRates.js";
import type { Booking } from "../discipline/drawCards.js";
import type { SimPlayer } from "../gameState.js";
import type { Injury, InjuryKind } from "../players/matchInjuryChance.js";
import { scorersOf } from "../history/scorersOf.js";
import type { RefereeCall } from "../referees/refereeCalls.js";
import type { OrderOverruled, ShootoutKick } from "../settleShootout.js";
import { aiSubstitutions, onPitchAt, whoPlayed } from "./aiSubstitutions.js";
import { describeGoals, drawPenaltyMisses, type GoalEvent, type GoalSide, type PenaltyMiss } from "./goalDetails.js";

/** One thing that happened in a match, at a minute from 0 to 90; stoppage time counts as minute 45 or 90, a shootout as 90. */
export type MatchEvent =
  | GoalEvent
  | PenaltyMiss
  | { type: "card"; minute: number; clubId: string; playerId: string; card: Booking["card"] }
  /** `kind` is missing in a match saved before injury kinds; `isRecurrence` marks his last injury coming back. */
  | { type: "injury"; minute: number; clubId: string; playerId: string; days: number; kind?: InjuryKind; isRecurrence?: true }
  | { type: "substitution"; minute: number; clubId: string; playerId: string; offId: string }
  | { type: "halfTime"; minute: typeof HALF_TIME }
  | { type: "fullTime"; minute: typeof FULL_TIME }
  | RefereeCall
  | OrderOverruled
  | ShootoutKick;

export const HALF_TIME = 45;
export const FULL_TIME = 90;

// Goals in each 15-minute band, stoppage time in the band it ends: the 1,889 goals of the 760 Série A
// matches of 2024 and 2025 in ESPN's public match summaries (keyEvents), fetched 2026-10-10.
const GOALS_PER_BAND = [246, 247, 355, 298, 307, 436];
const BAND_MINUTES = 15;
const TOTAL_GOALS = GOALS_PER_BAND.reduce((sum, goals) => sum + goals, 0);
/** Share of a match's goals scored in each minute; index 0 is minute 1. */
const GOAL_DENSITY = Array.from({ length: FULL_TIME }, (_, i) => (GOALS_PER_BAND[Math.floor(i / BAND_MINUTES)] ?? 0) / BAND_MINUTES / TOTAL_GOALS);

/**
 * Scorers draw from a stream of their own, seeded by the save's seed and the fixture, so picking
 * them leaves every other draw of the day (and so every result) as it was.
 */
export function scorerStream(seed: number, fixtureId: string): () => number {
  return keyedStream(seed, fixtureId);
}

// Goal kinds, assists, missed penalties and the AI coaches' substitutions draw from a stream of
// their own too, salted apart from the scorers' one.
const DETAIL_STREAM_SALT = 0x90a1;

export function detailStream(seed: number, fixtureId: string): () => number {
  return scorerStream(seed ^ DETAIL_STREAM_SALT, fixtureId);
}

/**
 * How likely a side's goal falls in each minute after `from` (index 0 is minute 1): the real minute
 * shares, scaled by the ten-men effect from each red card on.
 */
export function goalMinuteWeights(ownReds: readonly number[], opponentReds: readonly number[], from: number): readonly number[] {
  // Most matches have no red card; their weights are the same every time, and a season draws them thousands of times.
  if (from === 0 && ownReds.length === 0 && opponentReds.length === 0) return ELEVEN_A_SIDE_WEIGHTS;
  return weightsAfter(ownReds, opponentReds, from);
}

function weightsAfter(ownReds: readonly number[], opponentReds: readonly number[], from: number): number[] {
  return GOAL_DENSITY.map((share, i) => {
    const minute = i + 1;
    if (minute <= from) return 0;
    const down = (reds: readonly number[]) => reds.filter((red) => red < minute).length;
    return share * scoringFactor(down(ownReds), down(opponentReds));
  });
}

const ELEVEN_A_SIDE_WEIGHTS: readonly number[] = weightsAfter([], [], 0);

/** A minute drawn by `weights`, no later than `latest`. */
export function drawMinute(weights: readonly number[], random: () => number, latest: number = FULL_TIME): number {
  const usable = weights.slice(0, Math.max(1, latest));
  const total = usable.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return Math.max(1, Math.min(latest, FULL_TIME));
  let roll = random() * total;
  const index = usable.findIndex((w) => (roll -= w) < 0);
  return (index < 0 ? usable.length - 1 : index) + 1;
}

const RANK: Record<MatchEvent["type"], number> = {
  goal: 0,
  penaltyMiss: 0,
  card: 0,
  injury: 0,
  varCheck: 0.5,
  wrongCall: 0.5,
  halfTime: 1,
  substitution: 2,
  fullTime: 3,
  orderOverruled: 4,
  shootoutKick: 5,
};

// VAR gives a penalty or a red card before it is taken or shown, and checks a goal after it goes in.
const rankOf = (e: MatchEvent) => (e.type === "varCheck" && (e.decision === "penaltyAwarded" || e.decision === "redCardGiven") ? -0.5 : RANK[e.type]);

/** Events in the order they happened; substitutions at minute 45 are made at half-time, a shootout comes after full time. */
export function inMatchOrder(events: readonly MatchEvent[]): MatchEvent[] {
  return [...events].sort((a, b) => a.minute - b.minute || rankOf(a) - rankOf(b));
}

export const sentOffMinute = (events: readonly MatchEvent[], playerId: string): number | undefined =>
  events.find((e) => e.type === "card" && e.card !== "yellow" && e.playerId === playerId)?.minute;

/** The last minute a player scores, assists or takes part in a missed penalty; 0 if he never does. */
export function lastAction(events: readonly MatchEvent[], playerId: string): number {
  let last = 0;
  for (const e of events) {
    const isInvolved =
      (e.type === "goal" && (e.playerId === playerId || e.assistId === playerId)) || (e.type === "penaltyMiss" && (e.playerId === playerId || e.keeperId === playerId));
    if (isInvolved && e.minute > last) last = e.minute;
  }
  return last;
}

/** The players credited with a side's goals, own goals left out. */
export function scorersFor(events: readonly MatchEvent[], clubId: string): string[] {
  return events.flatMap((e) => (e.type === "goal" && e.clubId === clubId && e.kind !== "ownGoal" ? [e.playerId] : []));
}

type Sides<T> = { home: T; away: T };

type KickOffMatch = {
  homeId: string;
  awayId: string;
  homeLineup: readonly SimPlayer[];
  awayLineup: readonly SimPlayer[];
  /** Who may come on for each side. */
  benches: Sides<readonly SimPlayer[]>;
  /** The sides whose AI coach makes substitutions; the coach makes his own. */
  aiSides: Sides<boolean>;
  penaltyTakers: Sides<string | null>;
  /** The strength each player plays at today. */
  strength: (player: SimPlayer) => number;
  /** How tired each player is before the match. */
  tiredness: (player: SimPlayer) => number;
  goals: Score;
  bookings: readonly Booking[];
  /** The players hurt in this match, by id. */
  injuries: ReadonlyMap<string, Injury>;
};

export type KickOffTimeline = {
  events: MatchEvent[];
  /** The players credited with each side's goals, own goals left out. */
  scorers: Sides<string[]>;
  /** Everyone who took part for each side. */
  played: Sides<SimPlayer[]>;
  /** Minutes of the players who did not play the whole match. */
  minutes: Map<string, number>;
};

/**
 * The timeline of a match whose final score was drawn at kick-off: its cards, its goals spread over
 * the real goal minutes, and its injuries. Scorers come from `scorerRandom`; a player sent off gets
 * the earliest of his side's goal minutes, redrawn before his red if needed. Goal kinds, assists,
 * missed penalties and the AI coaches' substitutions come from `detailRandom`; an injury comes
 * after the player's last goal, assist or penalty.
 */
export function kickOffTimeline(match: KickOffMatch, random: () => number, scorerRandom: () => number, detailRandom: () => number): KickOffTimeline {
  const cards: MatchEvent[] = match.bookings.map((b) => ({ type: "card", minute: b.minute, clubId: b.clubId, playerId: b.playerId, card: b.card }));
  const redsOf = (clubId: string) => match.bookings.filter((b) => b.card !== "yellow" && b.clubId === clubId).map((b) => b.minute);
  const sideGoals = (clubId: string, opponentId: string, lineup: readonly SimPlayer[], count: number) => {
    const weights = goalMinuteWeights(redsOf(clubId), redsOf(opponentId), 0);
    const minutes = Array.from({ length: count }, () => drawMinute(weights, random)).sort((a, b) => a - b);
    const scorers = scorersOf(lineup, count, scorerRandom);
    const byDeadline = scorers
      .map((playerId) => ({ playerId, deadline: sentOffMinute(cards, playerId) ?? Infinity }))
      .sort((a, b) => a.deadline - b.deadline);
    return byDeadline.map(({ playerId, deadline }, i): GoalEvent => {
      const drawn = minutes[i] ?? FULL_TIME;
      const minute = drawn < deadline ? drawn : drawMinute(weights, random, deadline - 1);
      return { type: "goal", minute, clubId, playerId };
    });
  };
  const home = sideGoals(match.homeId, match.awayId, match.homeLineup, match.goals.homeGoals);
  const away = sideGoals(match.awayId, match.homeId, match.awayLineup, match.goals.awayGoals);
  const side = (clubId: string, lineup: readonly SimPlayer[], penaltyTakerId: string | null): GoalSide => ({
    clubId,
    onPitch: (minute) => onPitchAt(lineup, [], cards, clubId, minute),
    penaltyTakerId,
  });
  const sides = { home: side(match.homeId, match.homeLineup, match.penaltyTakers.home), away: side(match.awayId, match.awayLineup, match.penaltyTakers.away) };
  const goals = describeGoals([...home, ...away], sides, match.strength, detailRandom);
  const misses = drawPenaltyMisses(sides, match.strength, 0, () => drawMinute(ELEVEN_A_SIDE_WEIGHTS, detailRandom), detailRandom);
  const actions: MatchEvent[] = [...goals, ...misses];
  const clubOf = new Map([...match.homeLineup, ...match.awayLineup].map((p) => [p.id, p.clubId]));
  const injuries: MatchEvent[] = [...match.injuries].map(([playerId, { days, kind, isRecurrence }]) => {
    const earliest = Math.max(1, lastAction(actions, playerId));
    const latest = Math.max(earliest, sentOffMinute(cards, playerId) ?? FULL_TIME);
    const minute = earliest + Math.floor(random() * (latest - earliest + 1));
    return { type: "injury", minute, clubId: clubOf.get(playerId) ?? "", playerId, days, kind, ...(isRecurrence ? { isRecurrence } : {}) };
  });
  const before = [...cards, ...actions, ...injuries];
  const goalDifferenceAt = (clubId: string) => (minute: number) =>
    goals.reduce((diff, g) => (g.minute < minute ? diff + (g.clubId === clubId ? 1 : -1) : diff), 0);
  const subsOf = (clubId: string, starters: readonly SimPlayer[], bench: readonly SimPlayer[], isAi: boolean) =>
    isAi ? aiSubstitutions({ clubId, starters, bench, tiredness: match.tiredness }, before, 0, goalDifferenceAt(clubId), detailRandom) : [];
  const subs = [
    ...subsOf(match.homeId, match.homeLineup, match.benches.home, match.aiSides.home),
    ...subsOf(match.awayId, match.awayLineup, match.benches.away, match.aiSides.away),
  ];
  const events = inMatchOrder([...before, ...subs, { type: "halfTime", minute: HALF_TIME }, { type: "fullTime", minute: FULL_TIME }]);
  const homePlayed = whoPlayed(match.homeLineup, match.benches.home, events, match.homeId);
  const awayPlayed = whoPlayed(match.awayLineup, match.benches.away, events, match.awayId);
  return {
    events,
    scorers: { home: scorersFor(events, match.homeId), away: scorersFor(events, match.awayId) },
    played: { home: homePlayed.players, away: awayPlayed.players },
    minutes: new Map([...homePlayed.minutes, ...awayPlayed.minutes]),
  };
}
