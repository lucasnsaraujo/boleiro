import { loadWorldPack } from "@boleiro/data/worldPack";
import type { CountryStart } from "../newGame.js";
import { MARKET_LEAGUES, marketLeaguesStart } from "./marketLeagues.js";

/** The market leagues from the shipped world packs, read in Node. */
export function loadMarketLeagues(season: number): CountryStart[] {
  return marketLeaguesStart(MARKET_LEAGUES.map((structure) => loadWorldPack(structure.id)), season);
}
