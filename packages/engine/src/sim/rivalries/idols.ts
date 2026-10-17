import { humanKey } from "../coach/closeCoachSeason.js";
import { daysBetween } from "../dates.js";
import type { GameState, SimPlayer } from "../gameState.js";
import { IDOL_APPS, IDOL_GOALS } from "../history/clubHistory.js";
import type { CoachRecord } from "../history/history.js";
import { derbyWinsOf } from "./rivalryMemory.js";
import { rivalryOf } from "./rivalryOf.js";

/** A human coach as the rivalries read him: his name (none in a one-coach game) and career record. */
export type HumanCoach = { name: string | undefined; record: CoachRecord };

// guess: from a city's second derby up (intensity 3), an idol of one side is unwelcome at the other.
export const BLOCK_FROM_INTENSITY = 3;
// guess: a coach becomes one of the club's own at five points: a point a year in charge, one and a half
// a title, a quarter a derby won. Five years do it alone; so do three years with a title and two derbies.
const YEAR_POINTS = 1;
const TITLE_POINTS = 1.5;
const DERBY_WIN_POINTS = 0.25;
const IDOL_POINTS = 5;
const YEAR_DAYS = 365.25;

export const seatedCoachOf = (state: Pick<GameState, "coachName" | "history">): HumanCoach => ({ name: state.coachName, record: state.history.coach });

/**
 * Whether a human coach is a long-serving idol of a club, from his years in charge there, its titles
 * under him and the derbies he won for it. A proxy that the idol status of career moments replaces.
 */
export function isIdolCoachAt(state: Pick<GameState, "date" | "rivalries">, coach: HumanCoach, clubId: string): boolean {
  const days = coach.record.stints.filter((s) => s.clubId === clubId).reduce((sum, s) => sum + daysBetween(s.from, s.until ?? state.date), 0);
  const titles = coach.record.trophies.filter((t) => t.clubId === clubId).length;
  const points = YEAR_POINTS * (days / YEAR_DAYS) + TITLE_POINTS * titles + DERBY_WIN_POINTS * derbyWinsOf(state, humanKey(coach.name), clubId);
  return points >= IDOL_POINTS;
}

/** The clubs a human coach is an idol of, in the order he first ran them. */
export function idolClubsOf(state: Pick<GameState, "date" | "rivalries">, coach: HumanCoach): string[] {
  const clubs = [...new Set(coach.record.stints.map((s) => s.clubId))];
  return clubs.filter((clubId) => isIdolCoachAt(state, coach, clubId));
}

/** The club whose idol the coach in the seat is and whose big derby rival `clubId` is; null when nothing stands between him and the club. */
export function rivalBlockOf(state: GameState, clubId: string): string | null {
  return idolClubsOf(state, seatedCoachOf(state)).find((idolOf) => (rivalryOf(idolOf, clubId)?.intensity ?? 0) >= BLOCK_FROM_INTENSITY) ?? null;
}

/** Whether a player is an idol of his club as its history counts them (clubHistory's appearances or goals). */
export function isIdolPlayerAt(state: Pick<GameState, "history">, playerId: string, clubId: string): boolean {
  const record = state.history.players[clubId]?.[playerId];
  return !!record && (record.apps >= IDOL_APPS || record.goals >= IDOL_GOALS);
}

/** Whether a player won't move to a club because he is an idol of its big derby rival. */
export function idolRefusesMove(state: Pick<GameState, "history">, player: Pick<SimPlayer, "id" | "clubId">, toClubId: string): boolean {
  return (rivalryOf(player.clubId, toClubId)?.intensity ?? 0) >= BLOCK_FROM_INTENSITY && isIdolPlayerAt(state, player.id, player.clubId);
}
