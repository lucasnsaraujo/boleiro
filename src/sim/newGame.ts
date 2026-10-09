import type { Club } from "../data/clubs.js";
import type { SquadPlayer } from "../data/players.js";
import { randomStream } from "../engine/random.js";
import type { GameState, SimPlayer } from "./gameState.js";
import { startSeason } from "./startSeason.js";

export type NewGameOptions = {
  clubs: readonly Club[];
  players: readonly SquadPlayer[];
  coachClubId: string | null;
  season?: number;
};

const FIRST_SEASON = 2026;

export function newGame(seed: number, { clubs, players, coachClubId, season = FIRST_SEASON }: NewGameOptions): GameState {
  const random = randomStream(seed);
  const clubsById = Object.fromEntries(clubs.map((club) => [club.id, club]));
  const simPlayers = players
    .filter((player) => clubsById[player.clubId])
    .map(({ clubId, name, group, strength }, index): SimPlayer => ({ id: `p${index}`, clubId, name, group, strength }));
  const { calendar, competitions, fixtures } = startSeason(season, clubsById, random.next);
  return {
    version: 1,
    seed,
    rngState: random.state(),
    date: `${season}-01-01`,
    season,
    coachClubId,
    clubs: clubsById,
    players: Object.fromEntries(simPlayers.map((player) => [player.id, player])),
    calendar,
    competitions,
    fixtures,
  };
}
