import type { GameState } from "../sim/gameState.js";
import { loadNewGame } from "../sim/loadNewGame.js";
import type { CountryStart } from "../sim/newGame.js";
import { loadEurope } from "../sim/world/loadEurope.js";
import { loadGuests } from "../sim/world/loadGuests.js";
import { loadMarketLeagues } from "../sim/world/loadMarketLeagues.js";
import { loadSouthAmerica } from "../sim/world/loadSouthAmerica.js";
import type { WorldClub } from "../sim/world/world.js";

const countriesAt = (season: number): CountryStart[] => [...loadSouthAmerica(season), ...loadEurope(season), ...loadMarketLeagues(season)];

/** The clubs of a set of countries. */
export const clubsOf = (countries: readonly CountryStart[]): number => countries.reduce((sum, { levels }) => sum + levels.reduce((n, clubs) => n + clubs.length, 0), 0);

/**
 * `countries` as new countries with new ids: the same leagues, clubs and squads, none of them in a continental or UEFA place.
 * Only a test or bench builds a world this way; the game's data never holds a clone.
 */
function clonesOf(countries: readonly CountryStart[], copy: number): CountryStart[] {
  const withCopy = (club: WorldClub): WorldClub => ({ ...club, id: `${club.id}~${copy}` });
  return countries.map(({ structure, levels }) => ({
    structure: { ...structure, id: `${structure.id}-x${copy}`, continental: [], uefa: undefined },
    levels: levels.map((clubs) => clubs.map(withCopy)),
  }));
}

/** The game as a player gets it: Brazil's full tier, the leagues abroad result-only and the Club World Cup's guests, about 1,300 clubs. */
export function v1WorldStart(seed: number, season = 2026): GameState {
  return loadNewGame(seed, { coachClubId: null, world: countriesAt(season), guests: loadGuests(season), season });
}

/**
 * The v1 world plus clones of its leagues abroad, as many as it takes to hold at least `clubs` clubs,
 * for the bench that checks a bigger world still plays a season in time.
 */
export function syntheticWorldStart(seed: number, clubs: number, season = 2026): { state: GameState; clubs: number } {
  const real = countriesAt(season);
  const guests = loadGuests(season);
  const brazil = loadNewGame(seed, { coachClubId: null, season }).clubs;
  const base = Object.keys(brazil).length + clubsOf(real) + Object.values(guests).reduce((sum, list) => sum + list.length, 0);
  const copies = Math.max(0, Math.ceil((clubs - base) / clubsOf(real)));
  const world = [...real, ...Array.from({ length: copies }, (_, i) => clonesOf(real, i + 1)).flat()];
  return { state: loadNewGame(seed, { coachClubId: null, world, guests, season }), clubs: base + copies * clubsOf(real) };
}
