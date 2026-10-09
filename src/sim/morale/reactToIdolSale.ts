import type { GameState } from "../gameState.js";
import { clubMood } from "./clubMood.js";

// guess: fan mood lost when the club sells one of its three strongest players (an idol) or
// another regular starter; selling anyone else goes unnoticed.
const IDOL_SALE_FANS = 8;
const STARTER_SALE_FANS = 3;
const IDOLS_PER_SQUAD = 3;
const STARTERS = 11;

/**
 * Fans' reaction to the sale of `playerId`. Call it before the player leaves, while he is still
 * in his club's squad; the transfer market calls it for every sale.
 */
export function reactToIdolSale(state: GameState, playerId: string): GameState {
  const player = state.players[playerId];
  if (!player) throw new Error(`no player ${playerId}`);
  const stronger = Object.values(state.players).filter((p) => p.clubId === player.clubId && p.strength > player.strength).length;
  const lost = stronger < IDOLS_PER_SQUAD ? IDOL_SALE_FANS : stronger < STARTERS ? STARTER_SALE_FANS : 0;
  if (!lost) return state;
  const mood = clubMood(state, player.clubId);
  return { ...state, mood: { ...state.mood, [player.clubId]: { ...mood, fans: Math.max(0, mood.fans - lost) } } };
}
