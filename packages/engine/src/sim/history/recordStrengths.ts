import type { GameState } from "../gameState.js";
import type { History } from "./history.js";

/**
 * Marks every player's strength for the season just begun. Players gone from Brazilian football
 * lose their line unless a club still remembers them, the same way closeSeasonHistory forgets
 * passers-by; free agents keep theirs, since a club can still sign them.
 */
export function recordStrengths({ season, players, market, history }: Pick<GameState, "season" | "players" | "market" | "history">): History {
  const remembered = new Set(Object.values(history.players).flatMap((atClub) => Object.keys(atClub)));
  const strength = Object.fromEntries(Object.entries(history.strength).filter(([id]) => players[id] || market.freeAgents[id] || remembered.has(id)));
  for (const p of Object.values(players)) {
    strength[p.id] = [...(strength[p.id] ?? []).filter((mark) => mark.season !== season), { season, strength: p.strength }];
  }
  return { ...history, strength };
}
