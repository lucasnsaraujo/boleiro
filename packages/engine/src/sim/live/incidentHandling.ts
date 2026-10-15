import type { GameState } from "../gameState.js";

/** How a side's red cards and injuries are answered during a match: its human coach decides in a window, or its AI coach's substitutions do. */
export type IncidentHandling = "askCoach" | "aiSubstitutions";

/**
 * Who answers a club's red cards and injuries in a match. Every substitution path routes through
 * here: the live round opens its window only on "askCoach", and kick-off plays AI substitutions
 * for "aiSubstitutions".
 */
export function incidentHandling(state: Pick<GameState, "coachClubId">, clubId: string): IncidentHandling {
  return clubId === state.coachClubId ? "askCoach" : "aiSubstitutions";
}
