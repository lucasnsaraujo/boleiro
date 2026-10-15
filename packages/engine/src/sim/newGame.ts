import type { Club } from "@boleiro/data/clubs";
import type { CompetitionMoney } from "@boleiro/data/competition-money";
import type { ClubLineup } from "@boleiro/data/dataPack";
import type { Role, SquadPlayer } from "@boleiro/data/players";
import { randomStream } from "../engine/random.js";
import { openingCoach } from "./coach/openingCoach.js";
import { openingField } from "./continental/continentalField.js";
import { openContinentalCups } from "./continental/openContinentalCups.js";
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
import { startCountry } from "./world/resultOnlyWorld.js";
import type { CountryStructure, World, WorldClub } from "./world/world.js";

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
};

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

/** Each country gets a stream of its own, seeded from the game's seed and its id, so other countries listed or not don't change it. */
function startWorld(countries: readonly CountryStart[], season: number, seed: number): World {
  const world: World = {};
  for (const { structure, levels } of countries) {
    if (!COUNTRY_ID.test(structure.id)) throw new Error(`invalid country id "${structure.id}": only lowercase letters, digits and dashes`);
    if (structure.id in world) throw new Error(`two countries have the id ${structure.id}`);
    world[structure.id] = startCountry(structure, levels, season, (seed ^ WORLD_STREAM_SALT ^ hashText(structure.id)) >>> 0);
  }
  return world;
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
  { clubs, players, positions = [], lineups = [], finances: financeData, competitionMoney, packVersion, coachClubId, careerMode = false, season = FIRST_SEASON, world, stateChampionships = true }: NewGameOptions,
): GameState {
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
  const { calendar, competitions, fixtures } = startSeason(season, clubsById, random.next, FIRST_QUALIFICATION, stateChampionships);
  const { economy, finances: boardFinances, wages } = openingFinances(clubsById, squadPlayers, competitions, fixtures, financeData, competitionMoney);
  const finances = withNewCoachRoom(boardFinances, coachClubId);
  const simPlayers = Object.fromEntries(squadPlayers.map((player) => [player.id, { ...player, wage: wages[player.id] ?? 0 }]));
  const usualLineups = openingLineups(Object.keys(clubsById), squadsByClub(simPlayers), lineups, (row) => idOfRow.get(row));
  const market = openingMarket(seed);
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
    ...(world?.length ? { world: startWorld(world, season, seed) } : {}),
    ...(stateChampionships ? {} : { playsStateChampionships: false as const }),
  }, careerMode, randomStream(seed ^ COACH_STREAM_SALT).next);
  return withContinentalCups(game, competitionMoney);
}

/** The game with CONMEBOL's cups when South America is in its world, their prizes kept in its economy. */
function withContinentalCups(state: GameState, competitionMoney: CompetitionMoney): GameState {
  const field = openingField(state);
  if (!field) return state;
  const withStages = { ...state, economy: { ...state.economy, continentalStages: continentalStagesOf(competitionMoney) } };
  return openContinentalCups(withExpectedContinentalPrizes(withStages, field), field);
}
