import type { Club } from "../data/clubs.js";
import type { CompetitionMoney } from "../data/competition-money.js";
import type { SquadPlayer } from "../data/players.js";
import { randomStream } from "../engine/random.js";
import { NEUTRAL_MOOD } from "./morale/clubMood.js";
import { openingFinances, type FinanceData } from "./finances/openingFinances.js";
import type { GameState, SimPlayer } from "./gameState.js";
import type { Qualification } from "./copaDoBrasilEntrants.js";
import { openingProfile } from "./players/openingProfile.js";
import { cupEntriesOf, startSeason } from "./startSeason.js";

export type NewGameOptions = {
  clubs: readonly Club[];
  players: readonly SquadPlayer[];
  finances: FinanceData;
  competitionMoney: CompetitionMoney;
  coachClubId: string | null;
  season?: number;
};

const FIRST_SEASON = 2026;
// Traits draw from their own stream so they don't reshuffle the fixtures a seed has always given.
const TRAIT_STREAM_SALT = 0x7a175;
// guess: with no earlier estaduais played, the first season seeds them and fills the Copa do Brasil
// from the national ranking stand-in (division, then fanbase).
const FIRST_QUALIFICATION: Qualification = { statePlacings: {}, phase3Ids: [] };

export function newGame(
  seed: number,
  { clubs, players, finances: financeData, competitionMoney, coachClubId, season = FIRST_SEASON }: NewGameOptions,
): GameState {
  const random = randomStream(seed);
  const traitRandom = randomStream(seed ^ TRAIT_STREAM_SALT);
  const clubsById = Object.fromEntries(clubs.map((club) => [club.id, club]));
  const squadPlayers = players
    .filter((player) => clubsById[player.clubId])
    .map((player, index): Omit<SimPlayer, "wage"> => {
      const { clubId, name, group, strength } = player;
      return { id: `p${index}`, clubId, name, group, strength, ...openingProfile(player, `${season}-01-01`, traitRandom.next) };
    });
  const { calendar, competitions, fixtures } = startSeason(season, clubsById, random.next, FIRST_QUALIFICATION);
  const { economy, finances, wages } = openingFinances(clubsById, squadPlayers, fixtures, cupEntriesOf(competitions), financeData, competitionMoney);
  return {
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
  };
}
