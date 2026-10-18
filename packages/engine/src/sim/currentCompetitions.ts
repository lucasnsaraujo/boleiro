import type { Competition, GameState } from "./gameState.js";
import { competitionKey } from "./history/history.js";

/**
 * Whether a competition is this season's: Brazil's and the cups by the game's season, a league abroad
 * by its newest season in the game, so one whose season crosses the new year counts until its next opens.
 */
export function isCurrentOf(state: Pick<GameState, "competitions" | "season">): (competition: Competition) => boolean {
  const newest = new Map<string, number>();
  for (const c of Object.values(state.competitions)) {
    if (c.kind === "league" && c.abroad) newest.set(competitionKey(c.id), Math.max(c.season, newest.get(competitionKey(c.id)) ?? c.season));
  }
  return (c) => (c.kind === "league" && c.abroad ? c.season === newest.get(competitionKey(c.id)) : c.season === state.season);
}
