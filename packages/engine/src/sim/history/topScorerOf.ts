import type { GameState } from "../gameState.js";
import type { TopScorer } from "./history.js";
import { compareText } from "../compareText.js";

/** A competition's top scorer: most goals, then the player id; one who has left the game is named as his club's history knows him. */
export function topScorerOf(goals: Readonly<Record<string, number>>, state: Pick<GameState, "players" | "history">): TopScorer | null {
  const [best] = Object.entries(goals).sort(([a, x], [b, y]) => y - x || compareText(a, b));
  if (!best) return null;
  const [playerId, count] = best;
  const player = state.players[playerId];
  const known = Object.entries(state.history.players).find(([, players]) => playerId in players);
  return {
    playerId,
    name: player?.name ?? known?.[1][playerId]?.name ?? playerId,
    clubId: player?.clubId ?? known?.[0] ?? "",
    goals: count,
  };
}
