import type { GameState } from "../gameState.js";
import { chemistryOf } from "./chemistryOf.js";

/** The coach of `clubId` hands the armband to one of his players; the captain keeps it until he leaves the club. */
export function nameCaptain(state: GameState, clubId: string, playerId: string): GameState {
  if (state.players[playerId]?.clubId !== clubId) throw new Error(`${playerId} doesn't play for ${clubId}`);
  // A club that hasn't played yet keeps no eleven; the meter reads its usual one.
  const record = state.chemistry?.[clubId] ?? { eleven: [], settled: 0, steadyGames: 0, kept: 0, was: chemistryOf(state, clubId).value };
  return { ...state, chemistry: { ...state.chemistry, [clubId]: { ...record, captainId: playerId } } };
}
