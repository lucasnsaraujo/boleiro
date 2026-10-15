import type { WorldPack } from "@boleiro/data/worldPack";
import type { CountryStart } from "../newGame.js";
import { countriesStart } from "./countriesStart.js";
import type { UefaAllocation } from "./uefaPlaces.js";
import type { CountryStructure } from "./world.js";

// guess: every league crossing the new year plays from mid-August to late May, about the span of
// the big five's 2026/27 seasons; the real start and end days differ by a week or two per league.
const SEASON: [string, string] = ["08-15", "05-23"];
const ROLLOVER = "07-01";

/**
 * A two-level European pyramid played as straight double round robins (SPEC §6 allows it for the
 * result-only tier). `down` is how many clubs go down directly and come up from the level below:
 * a play-off between the two levels is not played, while one inside the second level (England's,
 * Spain's, Italy's, Turkey's, Poland's) counts as its third promotion place.
 */
function country(id: string, top: string, second: string | null, down: number, uefa: UefaAllocation, window = SEASON): CountryStructure {
  const levels = second
    ? [
        { name: top, legs: 2 as const, promoted: 0, relegated: down },
        { name: second, legs: 2 as const, promoted: down, relegated: 0 },
      ]
    : [{ name: top, legs: 2 as const, promoted: 0, relegated: 0 }];
  return { id, levels, window, ...(window === SEASON ? { rollover: ROLLOVER } : {}), continental: [], uefa, hasCup: true };
}

const places = (championsLeague: number, europaLeague: number): UefaAllocation => ({ championsLeague, europaLeague });

/**
 * Every country with a club in the 2026/27 Champions League or Europa League league phase, as
 * Transfermarkt's participant pages listed the draw on 2026-10-14 (pipeline/tm_world.py). The game
 * fixes UEFA's coefficients to that season: each country keeps as many places in each league phase as
 * it had clubs in it then (sources: the same pages, pipeline snapshot 3), 36 in each. Relegation
 * counts are each league's direct places; guess for Belgium, Greece, Bulgaria, Cyprus and Armenia,
 * whose 2026/27 regulations were not checked. Norway plays the calendar year (April to November,
 * guessed days). Transfermarkt lists no second tier for Azerbaijan.
 */
export const EUROPE: readonly CountryStructure[] = [
  country("gb-eng", "Premier League", "Championship", 3, places(5, 3)),
  country("es", "LaLiga", "LaLiga2", 3, places(5, 2)),
  country("it", "Serie A", "Serie B", 3, places(4, 2)),
  country("de", "Bundesliga", "2. Bundesliga", 2, places(4, 2)),
  country("fr", "Ligue 1", "Ligue 2", 2, places(3, 3)),
  country("pt", "Liga Portugal", "Liga Portugal 2", 2, places(2, 2)),
  country("nl", "Eredivisie", "Keuken Kampioen Divisie", 2, places(2, 2)),
  country("tr", "Süper Lig", "1. Lig", 3, places(2, 1)),
  country("be", "Jupiler Pro League", "Challenger Pro League", 2, places(1, 2)),
  country("gb-sct", "Scottish Premiership", "Scottish Championship", 1, places(0, 1)),
  country("at", "Bundesliga", "2. Liga", 1, places(1, 2)),
  country("gr", "Super League 1", "Super League 2", 2, places(1, 2)),
  country("cz", "Chance Liga", "Chance Národní Liga", 1, places(1, 2)),
  country("hr", "SuperSport HNL", "Prva Nogometna Liga", 1, places(0, 1)),
  country("ua", "Premier Liga", "Persha Liga", 2, places(1, 0)),
  country("pl", "Ekstraklasa", "I liga", 3, places(0, 2)),
  country("no", "Eliteserien", "OBOS-ligaen", 2, places(2, 1), ["04-05", "11-29"]),
  country("sk", "Niké Liga", "MONACObet Liga", 1, places(1, 0)),
  country("si", "Prva Liga", "Druga Liga", 1, places(0, 1)),
  country("hu", "Nemzeti Bajnokság", "Nemzeti Bajnokság II", 2, places(0, 1)),
  country("bg", "efbet Liga", "Vtora Liga", 2, places(0, 1)),
  country("cy", "Cyprus League", "2. Division", 2, places(0, 1)),
  country("am", "Premier League", "First League", 1, places(0, 1)),
  country("il", "Ligat ha'Al", "Liga Leumit", 2, places(0, 1)),
  country("az", "Premyer Liqa", null, 0, places(1, 0)),
];

/** Europe's countries of `EUROPE` with their packs' clubs and squads, level by level. */
export function europeStart(packs: readonly WorldPack[], season: number): CountryStart[] {
  return countriesStart(EUROPE, packs, season);
}
