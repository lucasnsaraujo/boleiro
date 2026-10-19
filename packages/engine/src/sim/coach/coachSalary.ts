import type { GameState } from "../gameState.js";
import { squadsOfGame } from "../players/squadsByClub.js";

// guess: a head coach earns about 4% of his club's monthly player wage bill; no published Brazilian
// figure covers every division.
const SHARE_OF_PLAYER_WAGES = 0.04;
// guess: no club pays a head coach less than two minimum wages (R$ 1,518 in 2025).
const MIN_SALARY = 2 * 1518;

/** The monthly salary, in BRL, a club offers its head coach. */
export function coachSalary(state: Pick<GameState, "players">, clubId: string): number {
  let wages = 0;
  for (const player of squadsOfGame(state).get(clubId) ?? []) wages += player.wage;
  return Math.max(MIN_SALARY, Math.round(SHARE_OF_PLAYER_WAGES * wages));
}
