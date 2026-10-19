import type { GameState } from "../sim/gameState.js";
import { loadNewGame } from "../sim/loadNewGame.js";
import { loadEurope } from "../sim/world/loadEurope.js";
import { loadGuests } from "../sim/world/loadGuests.js";
import { loadMarketLeagues } from "../sim/world/loadMarketLeagues.js";
import { loadSouthAmerica } from "../sim/world/loadSouthAmerica.js";

/** The game as a player gets it: Brazil's full tier, the leagues abroad result-only and the Club World Cup's guests, about 1,300 clubs. */
export function v1WorldStart(seed: number, season = 2026): GameState {
  const world = [...loadSouthAmerica(season), ...loadEurope(season), ...loadMarketLeagues(season)];
  return loadNewGame(seed, { coachClubId: null, world, guests: loadGuests(season), season });
}
