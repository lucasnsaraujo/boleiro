import type { GameState, SimPlayer } from "../gameState.js";
import { IDOL_APPS, IDOL_GOALS } from "../history/clubHistory.js";
import { IDOL_LINE, idolStandingOf, type HumanCoach } from "../moments/idolStanding.js";
import { rivalryOf } from "./rivalryOf.js";

export type { HumanCoach };

// guess: from a city's second derby up (intensity 3), an idol of one side is unwelcome at the other.
export const BLOCK_FROM_INTENSITY = 3;

export const seatedCoachOf = (state: Pick<GameState, "coachName" | "history">): HumanCoach => ({ name: state.coachName, record: state.history.coach });

/** Whether a human coach is an idol of a club: his standing with its fans (idolStanding.ts) reached the idol line. */
export function isIdolCoachAt(state: Pick<GameState, "date" | "rivalries">, coach: HumanCoach, clubId: string): boolean {
  return idolStandingOf(state, coach, clubId).points >= IDOL_LINE;
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
