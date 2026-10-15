import type { Score } from "../../engine/match.js";
import { keyedStream } from "../../engine/random.js";
import { scoringFactor } from "../../engine/sendOffRates.js";
import type { Booking } from "../discipline/drawCards.js";
import type { SimPlayer } from "../gameState.js";
import { scorersOf } from "../history/scorersOf.js";

/** One thing that happened in a match, at a minute from 0 to 90; stoppage time counts as minute 45 or 90. */
export type MatchEvent =
  | { type: "goal"; minute: number; clubId: string; playerId: string }
  | { type: "card"; minute: number; clubId: string; playerId: string; card: Booking["card"] }
  | { type: "injury"; minute: number; clubId: string; playerId: string; days: number }
  | { type: "substitution"; minute: number; clubId: string; playerId: string; offId: string }
  | { type: "halfTime"; minute: typeof HALF_TIME }
  | { type: "fullTime"; minute: typeof FULL_TIME };

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
function drawMinute(weights: readonly number[], random: () => number, latest: number = FULL_TIME): number {
  const usable = weights.slice(0, Math.max(1, latest));
  const total = usable.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return Math.max(1, Math.min(latest, FULL_TIME));
  let roll = random() * total;
  const index = usable.findIndex((w) => (roll -= w) < 0);
  return (index < 0 ? usable.length - 1 : index) + 1;
}

const RANK: Record<MatchEvent["type"], number> = { goal: 0, card: 0, injury: 0, halfTime: 1, substitution: 2, fullTime: 3 };

/** Events in the order they happened; substitutions at minute 45 are made at half-time. */
export function inMatchOrder(events: readonly MatchEvent[]): MatchEvent[] {
  return [...events].sort((a, b) => a.minute - b.minute || RANK[a.type] - RANK[b.type]);
}

export const sentOffMinute = (events: readonly MatchEvent[], playerId: string): number | undefined =>
  events.find((e) => e.type === "card" && e.card !== "yellow" && e.playerId === playerId)?.minute;

type KickOffMatch = {
  homeId: string;
  awayId: string;
  homeLineup: readonly SimPlayer[];
  awayLineup: readonly SimPlayer[];
  goals: Score;
  bookings: readonly Booking[];
  /** Player id to days out, for the players hurt in this match. */
  injuries: ReadonlyMap<string, number>;
};

/**
 * The timeline of a match whose final score was drawn at kick-off: its cards, its goals spread over
 * the real goal minutes, and its injuries. Scorers come from `scorerRandom` exactly as the history
 * picks them; a player sent off gets the earliest of his side's goal minutes, redrawn before his red
 * if needed, and an injury comes after the player's last goal.
 */
export function kickOffTimeline(match: KickOffMatch, random: () => number, scorerRandom: () => number): { events: MatchEvent[]; scorers: { home: string[]; away: string[] } } {
  const cards: MatchEvent[] = match.bookings.map((b) => ({ type: "card", minute: b.minute, clubId: b.clubId, playerId: b.playerId, card: b.card }));
  const redsOf = (clubId: string) => match.bookings.filter((b) => b.card !== "yellow" && b.clubId === clubId).map((b) => b.minute);
  const sideGoals = (clubId: string, opponentId: string, lineup: readonly SimPlayer[], count: number) => {
    const weights = goalMinuteWeights(redsOf(clubId), redsOf(opponentId), 0);
    const minutes = Array.from({ length: count }, () => drawMinute(weights, random)).sort((a, b) => a - b);
    const scorers = scorersOf(lineup, count, scorerRandom);
    const byDeadline = scorers
      .map((playerId) => ({ playerId, deadline: sentOffMinute(cards, playerId) ?? Infinity }))
      .sort((a, b) => a.deadline - b.deadline);
    const goals = byDeadline.map(({ playerId, deadline }, i): MatchEvent => {
      const drawn = minutes[i] ?? FULL_TIME;
      const minute = drawn < deadline ? drawn : drawMinute(weights, random, deadline - 1);
      return { type: "goal", minute, clubId, playerId };
    });
    return { goals, scorers };
  };
  const home = sideGoals(match.homeId, match.awayId, match.homeLineup, match.goals.homeGoals);
  const away = sideGoals(match.awayId, match.homeId, match.awayLineup, match.goals.awayGoals);
  const goals = [...home.goals, ...away.goals];
  const clubOf = new Map([...match.homeLineup, ...match.awayLineup].map((p) => [p.id, p.clubId]));
  const injuries: MatchEvent[] = [...match.injuries].map(([playerId, days]) => {
    const earliest = Math.max(1, ...goals.filter((g) => g.type === "goal" && g.playerId === playerId).map((g) => g.minute));
    const latest = Math.max(earliest, sentOffMinute(cards, playerId) ?? FULL_TIME);
    const minute = earliest + Math.floor(random() * (latest - earliest + 1));
    return { type: "injury", minute, clubId: clubOf.get(playerId) ?? "", playerId, days };
  });
  const events = inMatchOrder([...cards, ...goals, ...injuries, { type: "halfTime", minute: HALF_TIME }, { type: "fullTime", minute: FULL_TIME }]);
  return { events, scorers: { home: home.scorers, away: away.scorers } };
}
