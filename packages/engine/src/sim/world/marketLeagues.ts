import type { WorldPack } from "@boleiro/data/worldPack";
import type { CountryStart } from "../newGame.js";
import { countriesStart } from "./countriesStart.js";
import type { CountryStructure } from "./world.js";

const ONLY_LEVEL = { promoted: 0, relegated: 0 };

/**
 * The leagues that buy from Brazil without sending a club to CONMEBOL's or UEFA's cups (SPEC §6),
 * one level each: Transfermarkt lists no second tier for them (pipeline/tm_world.py), so nobody goes
 * down. Result-only, each plays a straight round robin: Saudi Arabia's 18 clubs twice from August to
 * May, as its real league does; MLS's 30 once over its season, the 2026 one opening on 21 February;
 * Liga MX's 18 twice over the calendar year, its Clausura and Apertura end to end. In the full tier
 * MLS plays its conferences and play-offs and Liga MX its two tournaments with their liguillas
 * (leagueFormats.ts). guess: the seasons' last days, and Saudi Arabia's first.
 */
export const MARKET_LEAGUES: readonly CountryStructure[] = [
  { id: "sa", levels: [{ name: "Saudi Pro League", legs: 2, ...ONLY_LEVEL }], window: ["08-21", "05-22"], rollover: "07-01", continental: [] },
  { id: "us", levels: [{ name: "MLS", legs: 1, ...ONLY_LEVEL, format: "mls" }], window: ["02-21", "11-07"], continental: [] },
  { id: "mx", levels: [{ name: "Liga MX", legs: 2, ...ONLY_LEVEL, format: "liga-mx" }], window: ["01-09", "12-13"], continental: [] },
];

/** The market leagues of `MARKET_LEAGUES` with their packs' clubs and squads. */
export function marketLeaguesStart(packs: readonly WorldPack[], season: number): CountryStart[] {
  return countriesStart(MARKET_LEAGUES, packs, season);
}
