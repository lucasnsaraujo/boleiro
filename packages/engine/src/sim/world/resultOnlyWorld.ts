import { randomStream } from "../../engine/random.js";
import type { IsoDate } from "../gameState.js";
import { continentalPlaces } from "./continentalPlaces.js";
import { pyramidMoves, type LevelExits } from "./pyramidMoves.js";
import { checkSquad, leagueTable, openLeague, playLeagueDay } from "./resultOnlyLeague.js";
import type { Country, CountryStructure, ResultOnlyLeague, World, WorldClub } from "./world.js";

function checkPyramid({ id, levels }: CountryStructure, sizes: readonly number[]): void {
  if (levels.length === 0) throw new Error(`${id}: no levels`);
  if (sizes.length !== levels.length) throw new Error(`${id}: ${levels.length} levels but clubs for ${sizes.length}`);
  levels.forEach((level, i) => {
    const size = sizes[i] ?? 0;
    const below = levels[i + 1];
    if (size < 2) throw new Error(`${id} ${level.name}: needs at least two clubs`);
    if (level.relegated !== (below?.promoted ?? 0)) throw new Error(`${id} ${level.name}: relegates ${level.relegated} but the level below promotes ${below?.promoted ?? 0}`);
    if ((i > 0 ? level.promoted : 0) + level.relegated > size) throw new Error(`${id} ${level.name}: moves more clubs than it has`);
  });
}

function openLeagues(structure: CountryStructure, members: readonly string[][], season: number, random: () => number): ResultOnlyLeague[] {
  return structure.levels.map((level, i) =>
    openLeague(`${structure.id}-${i + 1}-${season}`, season, [...(members[i] ?? [])].sort(), level.legs, structure.window, random),
  );
}

/** A result-only country at the start of `season`, `levels` holding its clubs level by level, top first. */
export function startCountry(structure: CountryStructure, levels: readonly (readonly WorldClub[])[], season: number, seed: number): Country {
  checkPyramid(structure, levels.map((clubs) => clubs.length));
  for (const club of levels.flat()) checkSquad(club);
  const random = randomStream(seed);
  const leagues = openLeagues(structure, levels.map((clubs) => clubs.map((club) => club.id)), season, random.next);
  const clubs = Object.fromEntries(levels.flat().map((club) => [club.id, club]));
  return { structure, clubs, leagues, seasons: [], rngState: random.state() };
}

function playCountryDay(country: Country, date: IsoDate): Country {
  const random = randomStream(country.rngState);
  const clubOf = (id: string): WorldClub => {
    const club = country.clubs[id];
    if (!club) throw new Error(`${country.structure.id}: no club ${id}`);
    return club;
  };
  const leagues = country.leagues.map((league) => playLeagueDay(league, date, clubOf, random.next));
  if (leagues.every((league, i) => league === country.leagues[i])) return country;
  return { ...country, leagues, rngState: random.state() };
}

/** Today's result-only matches; a country with none today stays the same object, so its save shard stays as written. */
export function playWorldDay(world: World, date: IsoDate): World {
  let changed = false;
  const played = Object.fromEntries(
    Object.entries(world).map(([id, country]) => {
      const next = playCountryDay(country, date);
      changed ||= next !== country;
      return [id, next];
    }),
  );
  return changed ? played : world;
}

/** Files a country's finished season, moves clubs through its pyramid and opens `season`. */
function endCountrySeason(country: Country, season: number): Country {
  const { structure } = country;
  const [top] = country.leagues;
  if (!top) throw new Error(`${structure.id}: no leagues to end`);
  const tables = country.leagues.map(leagueTable);
  const exits = new Map(
    structure.levels.map((level, i): [number, LevelExits] => {
      const table = tables[i] ?? [];
      return [i, { promotedIds: i > 0 ? table.slice(0, level.promoted) : [], relegatedIds: table.slice(table.length - level.relegated) }];
    }),
  );
  const moves = pyramidMoves(structure.levels.map((_, i) => i), exits);
  const members = structure.levels.map((_, i) =>
    country.leagues.flatMap((league, from) => league.clubIds.filter((id) => (moves.has(id) ? moves.get(id) : from) === i)),
  );
  const random = randomStream(country.rngState);
  const leagues = openLeagues(structure, members, season, random.next);
  const record = {
    season: top.season,
    champions: tables.map((table) => table[0] ?? ""),
    promoted: structure.levels.map((_, i) => [...(exits.get(i)?.promotedIds ?? [])]),
    relegated: structure.levels.map((_, i) => [...(exits.get(i)?.relegatedIds ?? [])]),
    continental: Object.fromEntries(continentalPlaces(structure.continental, tables[0] ?? [], null)),
  };
  return { ...country, leagues, seasons: [...country.seasons, record], rngState: random.state() };
}

/** Every result-only country rolled over to `season`. */
export function endWorldSeason(world: World, season: number): World {
  return Object.fromEntries(Object.entries(world).map(([id, country]) => [id, endCountrySeason(country, season)]));
}
