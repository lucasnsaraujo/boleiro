import type { Club } from "@boleiro/data/clubs";
import type { CompetitionMoney } from "@boleiro/data/competition-money";
import type { ClubLineup } from "@boleiro/data/dataPack";
import type { Role, SquadPlayer } from "@boleiro/data/players";
import { randomStream } from "../engine/random.js";
import { openingCoach, openingWaitingCoach } from "./coach/openingCoach.js";
import { openingField } from "./continental/continentalField.js";
import { openContinentalCups } from "./continental/openContinentalCups.js";
import { openingEuropeanCups } from "./continental/uefaCups.js";
import { continentalStagesOf, withExpectedContinentalPrizes } from "./continental/payContinentalPrizes.js";
import { newHistory } from "./history/history.js";
import { recordStrengths } from "./history/recordStrengths.js";
import { NEUTRAL_MOOD } from "./morale/clubMood.js";
import { openingFinances, type FinanceData } from "./finances/openingFinances.js";
import type { ClubFinance, GameState, IsoDate, SimPlayer } from "./gameState.js";
import { academyPlayer, groupsToFill } from "./players/developPlayers.js";
import type { Qualification } from "./copaDoBrasilEntrants.js";
import { openingProfile } from "./players/openingProfile.js";
import { squadsByClub } from "./players/squadsByClub.js";
import { openingLineups } from "./players/usualLineups.js";
import { tierOf } from "./finances/tierOf.js";
import { openingContractUntil } from "./transfers/openingContractUntil.js";
import { openingMarket } from "./transfers/openingMarket.js";
import { startSeason } from "./startSeason.js";
import { isRealista, REALISTA, type Formats } from "./formats.js";
import { unifiedDatesOf } from "./seasonCalendar.js";
import { clubsAbroad } from "./world/clubsAbroad.js";
import { mostRounds, startCountry } from "./world/resultOnlyWorld.js";
import { SOUTH_AMERICA } from "./world/southAmerica.js";
import type { CountryStructure, UnifiedDates, World, WorldClub } from "./world/world.js";
import { openAcademies } from "./youth/academy.js";

/** A result-only country to start: its structure and its clubs level by level, top first. */
export type CountryStart = { structure: CountryStructure; levels: readonly (readonly WorldClub[])[] };

export type NewGameOptions = {
  clubs: readonly Club[];
  players: readonly SquadPlayer[];
  /** Each player's positions, row for row with `players`, main first; a player left without plays his group. */
  positions?: readonly (readonly Role[])[];
  /** Clubs' last real elevens, as rows of `players`. */
  lineups?: readonly ClubLineup[];
  finances: FinanceData;
  competitionMoney: CompetitionMoney;
  /** The data pack the clubs, players and money above come from. */
  packVersion: string;
  coachClubId: string | null;
  /** Career mode: the coach starts unknown and unemployed, with offers from small clubs. */
  careerMode?: boolean;
  season?: number;
  /** Countries played result-only next to Brazil. */
  world?: readonly CountryStart[];
  /** False to start a game without the estaduais (SPEC §6's new-game option). */
  stateChampionships?: boolean;
  /** A hot-seat game: the first coach's name, and the other human coaches in turn order, each at a club of his own. */
  hotSeat?: { coachName: string; otherCoaches: readonly { name: string; clubId: string }[] };
  /** Each coach's market time per transfer window, in seconds; left out, the market has no clock. */
  marketClockSeconds?: number;
  /** The calendar and formats (Rápido, Realista or a custom mix); left out, Realista's. */
  formats?: Formats;
};

/** The most human coaches one game takes, all on one computer (SPEC §14). */
export const MAX_HUMAN_COACHES = 8;

const FIRST_SEASON = 2026;
// Traits draw from their own stream so they don't reshuffle the fixtures a seed has always given.
const TRAIT_STREAM_SALT = 0x7a175;
const COACH_STREAM_SALT = 0xc0ac4;
const CONTRACT_STREAM_SALT = 0xc0417;
// guess: with no earlier estaduais played, the first season seeds them and fills the Copa do Brasil
// from the national ranking stand-in (division, then fanbase).
const FIRST_QUALIFICATION: Qualification = { statePlacings: {}, phase3Ids: [] };
const ACADEMY_STREAM_SALT = 0xacade;
const WORLD_STREAM_SALT = 0x3071d;

/** A 32-bit FNV-1a hash of the text. */
function hashText(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  return hash >>> 0;
}

// A country's id names its save shard, which the desktop app keeps as a file; see `is_plain_name` in `apps/desktop/src-tauri/src/slots.rs`.
const COUNTRY_ID = /^[a-z0-9-]{1,64}$/;

/**
 * The country as `formats` plays it: no level meeting more often than they allow, and on the unified
 * calendar its season the calendar year, so it rolls over on 1 January with everyone.
 */
function inFormats(structure: CountryStructure, formats: Formats): CountryStructure {
  if (isRealista(formats)) return structure;
  const levels = structure.levels.map((level) => ({ ...level, legs: Math.min(level.legs, formats.leagueLegs) as 1 | 2 }));
  const played = { ...structure, levels };
  if (formats.calendar === "unified") delete played.rollover;
  return played;
}

/**
 * Each country gets a stream of its own, seeded from the game's seed and its id, so other countries
 * listed or not don't change it; those in `fullTier` keep only their cup here.
 */
function startWorld(countries: readonly CountryStart[], season: number, seed: number, unified: UnifiedDates | undefined, fullTier: ReadonlySet<string>): World {
  const world: World = {};
  for (const { structure, levels } of countries) {
    if (!COUNTRY_ID.test(structure.id)) throw new Error(`invalid country id "${structure.id}": only lowercase letters, digits and dashes`);
    if (structure.id in world) throw new Error(`two countries have the id ${structure.id}`);
    world[structure.id] = startCountry(structure, levels, season, (seed ^ WORLD_STREAM_SALT ^ hashText(structure.id)) >>> 0, unified, fullTier.has(structure.id));
  }
  return world;
}

/**
 * The result-only countries a human coach takes a club in, which join the full tier. guess: only on
 * the unified calendar, where every league turns its season on 1 January with Brazil's; a league
 * crossing the new year in the full tier is not built yet.
 */
function countriesOfHumans(countries: readonly CountryStart[], humanClubIds: readonly (string | null)[], formats: Formats): CountryStart[] {
  const taken = countries.filter(({ levels }) => levels.some((clubs) => clubs.some((club) => humanClubIds.includes(club.id))));
  if (taken.length && formats.calendar !== "unified") throw new Error("a club abroad needs the unified calendar");
  return taken;
}

/**
 * The data lists only part of some small clubs' squads (one has two players), so each club below
 * 18 promotes academy teenagers, as developPlayers does every season. Their wages come out of the
 * club's wage bill with everyone else's.
 */
function academyTopUp(clubs: readonly Club[], players: readonly Omit<SimPlayer, "wage">[], date: IsoDate, random: () => number): Omit<SimPlayer, "wage">[] {
  const squads = new Map<string, Omit<SimPlayer, "wage">[]>();
  for (const p of players) squads.set(p.clubId, [...(squads.get(p.clubId) ?? []), p]);
  return clubs.flatMap((club) =>
    groupsToFill(squads.get(club.id) ?? [], []).map((group, i) => academyPlayer(`a${date.slice(0, 4)}-${club.id}-${i}`, club.id, club.division, group, date, random)),
  );
}

// guess: every opening board spends exactly its wage cap, so a new coach could sign nobody in
// January; his board gives him a tenth of room for the first window. July's budget resets it.
const NEW_COACH_WAGE_ROOM = 1.1;

function withNewCoachRoom(finances: Record<string, ClubFinance>, coachClubId: string | null): Record<string, ClubFinance> {
  const finance = coachClubId === null ? undefined : finances[coachClubId];
  if (coachClubId === null || !finance) return finances;
  return { ...finances, [coachClubId]: { ...finance, wageCap: Math.round(NEW_COACH_WAGE_ROOM * finance.wageCap) } };
}

export function newGame(
  seed: number,
  { clubs: brazilClubs, players: brazilPlayers, positions = [], lineups = [], finances: financeData, competitionMoney, packVersion, coachClubId, careerMode = false, season = FIRST_SEASON, world, stateChampionships = true, hotSeat, marketClockSeconds, formats = REALISTA }: NewGameOptions,
): GameState {
  const countries = (world ?? []).map(({ structure, levels }) => ({ structure: inFormats(structure, formats), levels }));
  const fullTier = countriesOfHumans(countries, [coachClubId, ...(hotSeat?.otherCoaches ?? []).map((other) => other.clubId)], formats);
  const abroad = fullTier.map(clubsAbroad);
  const clubs = abroad.length ? [...brazilClubs, ...abroad.flatMap((country) => country.clubs)] : brazilClubs;
  const players = abroad.length ? [...brazilPlayers, ...abroad.flatMap((country) => country.players)] : brazilPlayers;
  const gridRounds = mostRounds(countries.flatMap(({ structure, levels }) => structure.levels.map((level, i) => ({ clubCount: levels[i]?.length ?? 0, legs: level.legs }))));
  const random = randomStream(seed);
  const traitRandom = randomStream(seed ^ TRAIT_STREAM_SALT);
  const contractRandom = randomStream(seed ^ CONTRACT_STREAM_SALT);
  const clubsById = Object.fromEntries(clubs.map((club) => [club.id, club]));
  const idOfRow = new Map<number, string>();
  const dataPlayers = players
    .map((player, row) => ({ player, row }))
    .filter(({ player }) => clubsById[player.clubId])
    .map(({ player, row }, index): Omit<SimPlayer, "wage"> => {
      const { clubId, name, group, strength } = player;
      const tier = tierOf(clubsById[clubId] ?? { division: null });
      const contractUntil = openingContractUntil(tier, season, contractRandom.next);
      const id = `p${index}`;
      idOfRow.set(row, id);
      const roles = positions[row];
      return { id, clubId, name, group, strength, ...(roles?.length ? { positions: [...roles] } : {}), contractUntil, ...openingProfile(player, `${season}-01-01`, traitRandom.next) };
    });
  const squadPlayers = [...dataPlayers, ...academyTopUp(clubs, dataPlayers, `${season}-01-01`, randomStream(seed ^ ACADEMY_STREAM_SALT).next)];
  const { calendar, competitions, fixtures } = startSeason(season, clubsById, random.next, FIRST_QUALIFICATION, stateChampionships, playsContinentalCups(countries), formats, gridRounds, fullTier.map((country) => country.structure));
  const { economy, finances: boardFinances, wages } = openingFinances(clubsById, squadPlayers, competitions, fixtures, financeData, competitionMoney);
  const finances = (hotSeat?.otherCoaches ?? []).map((other) => other.clubId).reduce(withNewCoachRoom, withNewCoachRoom(boardFinances, coachClubId));
  const simPlayers = Object.fromEntries(squadPlayers.map((player) => [player.id, { ...player, wage: wages[player.id] ?? 0 }]));
  const usualLineups = openingLineups(Object.keys(clubsById), squadsByClub(simPlayers), lineups, (row) => idOfRow.get(row));
  const market = openingMarket(seed);
  const startedWorld = countries.length ? startWorld(countries, season, seed, unifiedDatesOf(calendar), new Set(fullTier.map((country) => country.structure.id))) : null;
  const europe = startedWorld && openingEuropeanCups(startedWorld, seed, season, formats);
  const game = openingCoach({
    version: 4,
    packVersion,
    seed,
    rngState: random.state(),
    date: `${season}-01-01`,
    season,
    coachClubId,
    clubs: clubsById,
    players: simPlayers,
    calendar,
    competitions,
    fixtures,
    economy,
    finances,
    mood: Object.fromEntries(clubs.map((club) => [club.id, NEUTRAL_MOOD])),
    discipline: {},
    history: recordStrengths({ season, players: simPlayers, market, history: newHistory(season, `${season}-01-01`, careerMode ? null : coachClubId) }),
    market,
    usualLineups,
    ...(startedWorld ? { world: startedWorld } : {}),
    ...(europe ? { europe } : {}),
    ...(stateChampionships ? {} : { playsStateChampionships: false as const }),
    ...(isRealista(formats) ? {} : { formats }),
  }, careerMode, randomStream(seed ^ COACH_STREAM_SALT).next);
  const withClock = marketClockSeconds === undefined ? game : { ...game, marketClockSeconds };
  const withAcademies = { ...withClock, youth: openAcademies(withClock) };
  return withHotSeat(withContinentalCups(withAcademies, competitionMoney), hotSeat);
}

/** The game with its other human coaches waiting for their turns; a one-coach game stays as it is. */
function withHotSeat(state: GameState, hotSeat: NewGameOptions["hotSeat"]): GameState {
  if (!hotSeat) return state;
  const clubIds = [state.coachClubId, ...hotSeat.otherCoaches.map((other) => other.clubId)];
  if (clubIds.length > MAX_HUMAN_COACHES) throw new Error(`a game takes at most ${MAX_HUMAN_COACHES} coaches`);
  if (new Set(clubIds).size !== clubIds.length) throw new Error("each coach needs a club of his own");
  for (const other of hotSeat.otherCoaches) if (!(other.clubId in state.boards)) throw new Error(`no club ${other.clubId} for ${other.name}`);
  const waitingCoaches = hotSeat.otherCoaches.map((other) => openingWaitingCoach(state, other.name, other.clubId));
  return { ...state, coachName: hotSeat.coachName, waitingCoaches };
}

/** Whether the world holds all of South America, which the CONMEBOL cups need. */
function playsContinentalCups(world: readonly CountryStart[]): boolean {
  return SOUTH_AMERICA.every((structure) => world.some((country) => country.structure.id === structure.id));
}

/** The game with CONMEBOL's cups when South America is in its world, their prizes kept in its economy. */
function withContinentalCups(state: GameState, competitionMoney: CompetitionMoney): GameState {
  const field = openingField(state);
  if (!field) return state;
  const withStages = { ...state, economy: { ...state.economy, continentalStages: continentalStagesOf(competitionMoney) } };
  return openContinentalCups(withExpectedContinentalPrizes(withStages, field), field);
}
