import type { PlayedAbroad } from "../continental/cupsAbroad.js";
import { randomStream } from "../../engine/random.js";
import type { IsoDate, LeagueFormatId } from "../gameState.js";
import { LEAGUE_FORMATS } from "../leagueFormats.js";
import { continentalPlaces } from "./continentalPlaces.js";
import { pyramidMoves, type LevelExits } from "./pyramidMoves.js";
import { cupFinal, openCup, playCupDay, type ResultOnlyCup } from "./resultOnlyCup.js";
import { checkSquad, leagueMatches, leagueTable, openLeague, playLeagueDay, roundsOf } from "./resultOnlyLeague.js";
import { paramsForLeagueAbroad } from "../../engine/paramsForLeagueAbroad.js";
import { uefaPlaces } from "./uefaPlaces.js";
import type { Country, CountryStructure, ResultOnlyLeague, UnifiedDates, World, WorldClub } from "./world.js";

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

/**
 * The season's leagues, one per level, and the cup of a country that plays one; the cup draws after the
 * leagues, so a country without one draws as before. `unified` holds the unified calendar's days.
 */
function openSeason(structure: CountryStructure, members: readonly string[][], season: number, random: () => number, unified?: UnifiedDates): Pick<Country, "leagues" | "cup"> {
  const leagues = structure.levels.map((level, i) =>
    openLeague(`${structure.id}-${i + 1}-${season}`, season, [...(members[i] ?? [])].sort(), level.legs, structure.window, random, unified?.league),
  );
  if (!structure.hasCup) return { leagues };
  const levels = leagues.map((league) => league.clubIds);
  return { leagues, cup: openCup(`${structure.id}-cup-${season}`, season, levels, structure.window, leagues.flatMap((league) => league.dates), random, unified?.cup) };
}

/** What a country in the full tier opens its cup around on a real calendar: the days its full-tier leagues and UEFA's cups play. */
export type FullTierDays = { taken: readonly IsoDate[] };

/**
 * The season of a country in the full tier: its leagues play there, so only its cup opens here, on the
 * unified calendar's midweeks or over its window off the `taken` days.
 */
function openFullTierSeason(structure: CountryStructure, members: readonly string[][], season: number, random: () => number, unified?: UnifiedDates, days?: FullTierDays): Pick<Country, "leagues" | "cup"> {
  if (!structure.hasCup) return { leagues: [] };
  return { leagues: [], cup: openCup(`${structure.id}-cup-${season}`, season, members.map((ids) => [...ids].sort()), structure.window, days?.taken ?? [], random, unified?.cup) };
}

/**
 * A result-only country at the start of `season`, `levels` holding its clubs level by level, top first;
 * on the unified calendar its season is the calendar year, filed on 1 January with Brazil's. A country
 * a human coach brought into the full tier (`fullTier`) opens only its cup here.
 */
export function startCountry(structure: CountryStructure, levels: readonly (readonly WorldClub[])[], season: number, seed: number, unified?: UnifiedDates, fullTier?: FullTierDays): Country {
  checkPyramid(structure, levels.map((clubs) => clubs.length));
  for (const club of levels.flat()) checkSquad(club);
  const random = randomStream(seed);
  const members = levels.map((clubs) => clubs.map((club) => club.id));
  const opened = fullTier ? openFullTierSeason(structure, members, season, random.next, unified, fullTier) : openSeason(structure, members, season, random.next, unified);
  const isFullTier = fullTier !== undefined;
  const clubs = Object.fromEntries(levels.flat().map((club) => [club.id, club]));
  return { structure, clubs, ...opened, seasons: [], rngState: random.state(), ...(isFullTier ? { isFullTier: true as const } : {}) };
}

function playCountryDay(country: Country, date: IsoDate, playedAbroad?: PlayedAbroad): Country {
  const random = randomStream(country.rngState);
  const clubOf = (id: string): WorldClub => {
    const club = country.clubs[id];
    if (!club) throw new Error(`${country.structure.id}: no club ${id}`);
    return club;
  };
  const leagues = country.leagues.map((league, level) => playLeagueDay(league, date, clubOf, random.next, paramsForLeagueAbroad(country.structure.id, level)));
  const cup = country.cup && playCupDay(country.cup, date, clubOf, random.next, playedAbroad);
  if (cup === country.cup && leagues.every((league, i) => league === country.leagues[i])) return country;
  return { ...country, leagues, ...(cup ? { cup } : {}), rngState: random.state() };
}

const isFinished = (league: ResultOnlyLeague) => leagueMatches(league).every((match) => match.result !== null);
const isCupFinished = (cup: ResultOnlyCup | undefined) => !cup || cupFinal(cup) !== null;

/** Whether today files a season crossing the new year: its rollover day, with every league and its cup played; a country in the full tier turns with its leagues there (turnSeasonsAbroad). */
function isRolloverDay(country: Country, date: IsoDate): boolean {
  return !country.isFullTier && country.structure.rollover === date.slice(5) && country.leagues.every(isFinished) && isCupFinished(country.cup);
}

/**
 * Today's result-only matches, and the rollover of a country whose season crosses the new year on its
 * day; a country with neither stays the same object, so its save shard stays as written. A human club's
 * cup match the full tier played today (`playedAbroad`) keeps its score there.
 */
export function playWorldDay(world: World, date: IsoDate, playedAbroad?: PlayedAbroad): World {
  let changed = false;
  const played = Object.fromEntries(
    Object.entries(world).map(([id, country]) => {
      const today = playCountryDay(country, date, playedAbroad);
      const next = isRolloverDay(today, date) ? endCountrySeason(today, Number(date.slice(0, 4))) : today;
      changed ||= next !== country;
      return [id, next];
    }),
  );
  return changed ? played : world;
}

/** Who goes up and down from each level of a finished season's tables (top level first), and each moving club's new level. */
export function seasonMoves(structure: CountryStructure, tables: readonly (readonly string[])[]): { exits: Map<number, LevelExits>; moves: Map<string, number | null> } {
  const exits = new Map(
    structure.levels.map((level, i): [number, LevelExits] => {
      const table = tables[i] ?? [];
      return [i, { promotedIds: i > 0 ? table.slice(0, level.promoted) : [], relegatedIds: table.slice(table.length - level.relegated) }];
    }),
  );
  return { exits, moves: pyramidMoves(structure.levels.map((_, i) => i), exits) };
}

/** The days the season's top league and cup were decided, from its last dates. */
function finalsOf({ leagues, cup }: Pick<Country, "leagues" | "cup">): Pick<Country["seasons"][number], "finals"> {
  const league = leagues[0]?.dates.at(-1);
  const cupFinal = cup?.dates.at(-1);
  return league ? { finals: { league, ...(cupFinal ? { cup: cupFinal } : {}) } } : {};
}

/** Files the season `filed` from its final tables, moves clubs through the pyramid and opens `season`. */
function fileSeason(country: Country, tables: readonly (readonly string[])[], filed: number, season: number, unified?: UnifiedDates, days?: FullTierDays): Country {
  const { structure } = country;
  const { exits, moves } = seasonMoves(structure, tables);
  const members = structure.levels.map((_, i) => tables.flatMap((table, from) => table.filter((id) => (moves.has(id) ? moves.get(id) : from) === i)));
  const random = randomStream(country.rngState);
  const opened = country.isFullTier ? openFullTierSeason(structure, members, season, random.next, unified, days) : openSeason(structure, members, season, random.next, unified);
  const cup = country.cup ? cupFinal(country.cup) : null;
  const record = {
    season: filed,
    champions: tables.map((table) => table[0] ?? ""),
    promoted: structure.levels.map((_, i) => [...(exits.get(i)?.promotedIds ?? [])]),
    relegated: structure.levels.map((_, i) => [...(exits.get(i)?.relegatedIds ?? [])]),
    continental: {
      ...Object.fromEntries(continentalPlaces(structure.continental, tables[0] ?? [], null)),
      ...(structure.uefa ? uefaPlaces(structure.uefa, tables[0] ?? [], cup) : {}),
    },
    ...(cup ? { cup } : {}),
    ...finalsOf(country),
  };
  return { ...country, ...opened, seasons: [...country.seasons, record], rngState: random.state() };
}

/** Files a country's finished season from its result-only leagues, moves clubs through its pyramid and opens `season`. */
function endCountrySeason(country: Country, season: number, unified?: UnifiedDates): Country {
  const [top] = country.leagues;
  if (!top) throw new Error(`${country.structure.id}: no leagues to end`);
  return fileSeason(country, country.leagues.map(leagueTable), top.season, season, unified);
}

/**
 * A full-tier country's season filed from its leagues' final `tables` (top level first), on 1 January or
 * on its own rollover day, and its cup reopened for `season` off the `days` its leagues and UEFA's cups take.
 */
export function fileFullTierSeason(country: Country, tables: readonly (readonly string[])[], season: number, unified: UnifiedDates | undefined, days?: FullTierDays): Country {
  return fileSeason(country, tables, season - 1, season, unified, days);
}

/**
 * Every result-only country rolled over to `season` on 1 January, but for those whose season crosses it
 * and those in the full tier, which endSeason files; `unified` holds the new season's unified calendar days.
 */
export function endWorldSeason(world: World, season: number, unified?: UnifiedDates): World {
  return Object.fromEntries(Object.entries(world).map(([id, country]) => [id, country.structure.rollover || country.isFullTier ? country : endCountrySeason(country, season, unified)]));
}

/** The most match days any league of these pyramids plays, which the unified grid must hold: a round robin's rounds, or all the stages of the format a full-tier level plays. */
export function mostRounds(levels: readonly { clubCount: number; legs: 1 | 2; format?: LeagueFormatId }[]): number {
  const daysOf = ({ clubCount, legs, format }: (typeof levels)[number]) =>
    format ? LEAGUE_FORMATS[format].stageDateCounts(clubCount, legs).reduce((sum, days) => sum + days, 0) : roundsOf(clubCount, legs);
  return Math.max(0, ...levels.map(daysOf));
}
