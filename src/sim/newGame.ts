import type { Club } from "../data/clubs.js";
import type { CompetitionMoney } from "../data/competition-money.js";
import type { SquadPlayer } from "../data/players.js";
import { randomStream } from "../engine/random.js";
import { openingCoach } from "./coach/openingCoach.js";
import { newHistory } from "./history/history.js";
import { NEUTRAL_MOOD } from "./morale/clubMood.js";
import { openingFinances, type FinanceData } from "./finances/openingFinances.js";
import type { GameState, IsoDate, SimPlayer } from "./gameState.js";
import { academyPlayer, groupsToFill } from "./players/developPlayers.js";
import type { Qualification } from "./copaDoBrasilEntrants.js";
import { openingProfile } from "./players/openingProfile.js";
import { tierOf } from "./finances/tierOf.js";
import { openingContractUntil } from "./transfers/openingContractUntil.js";
import { openingMarket } from "./transfers/openingMarket.js";
import { startSeason } from "./startSeason.js";

export type NewGameOptions = {
  clubs: readonly Club[];
  players: readonly SquadPlayer[];
  finances: FinanceData;
  competitionMoney: CompetitionMoney;
  coachClubId: string | null;
  /** Career mode: the coach starts unknown and unemployed, with offers from small clubs. */
  careerMode?: boolean;
  season?: number;
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

export function newGame(
  seed: number,
  { clubs, players, finances: financeData, competitionMoney, coachClubId, careerMode = false, season = FIRST_SEASON }: NewGameOptions,
): GameState {
  const random = randomStream(seed);
  const traitRandom = randomStream(seed ^ TRAIT_STREAM_SALT);
  const contractRandom = randomStream(seed ^ CONTRACT_STREAM_SALT);
  const clubsById = Object.fromEntries(clubs.map((club) => [club.id, club]));
  const dataPlayers = players
    .filter((player) => clubsById[player.clubId])
    .map((player, index): Omit<SimPlayer, "wage"> => {
      const { clubId, name, group, strength } = player;
      const tier = tierOf(clubsById[clubId] ?? { division: null });
      const contractUntil = openingContractUntil(tier, season, contractRandom.next);
      return { id: `p${index}`, clubId, name, group, strength, contractUntil, ...openingProfile(player, `${season}-01-01`, traitRandom.next) };
    });
  const squadPlayers = [...dataPlayers, ...academyTopUp(clubs, dataPlayers, `${season}-01-01`, randomStream(seed ^ ACADEMY_STREAM_SALT).next)];
  const { calendar, competitions, fixtures } = startSeason(season, clubsById, random.next, FIRST_QUALIFICATION);
  const { economy, finances, wages } = openingFinances(clubsById, squadPlayers, competitions, fixtures, financeData, competitionMoney);
  return openingCoach({
    version: 1,
    seed,
    rngState: random.state(),
    date: `${season}-01-01`,
    season,
    coachClubId,
    clubs: clubsById,
    players: Object.fromEntries(squadPlayers.map((player) => [player.id, { ...player, wage: wages[player.id] ?? 0 }])),
    calendar,
    competitions,
    fixtures,
    economy,
    finances,
    mood: Object.fromEntries(clubs.map((club) => [club.id, NEUTRAL_MOOD])),
    discipline: {},
    history: newHistory(season, `${season}-01-01`, careerMode ? null : coachClubId),
    market: openingMarket(seed),
  }, careerMode, randomStream(seed ^ COACH_STREAM_SALT).next);
}
