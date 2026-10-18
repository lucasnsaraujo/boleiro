import type { Club } from "@boleiro/data/clubs";
import { randomStream } from "../../engine/random.js";
import { boardExpectations } from "../coach/boardExpectations.js";
import { uefaMatchDays } from "../continental/uefaCups.js";
import { formatsOf, type Formats } from "../formats.js";
import type { Competition, Fixture, GameState, IsoDate, LeagueCompetition } from "../gameState.js";
import { finalOrderOf } from "../leagueFormats.js";
import { openNextStage } from "../openNextStage.js";
import { leaguesAbroad } from "../startSeason.js";
import { fileFullTierSeason, seasonMoves, type FullTierDays } from "./resultOnlyWorld.js";
import type { Country } from "./world.js";

/** Whether a full-tier country turns its season on its own day, apart from Brazil's 1 January: a season crossing the new year on a real calendar. */
export const turnsOnItsOwn = (country: Pick<Country, "structure" | "isFullTier">): boolean => country.isFullTier === true && country.structure.rollover !== undefined;

/** Whether every stage of the competition is drawn and every one of its `fixtures` played. */
export const isFinished = (competition: Competition, fixtures: readonly Fixture[]): boolean =>
  competition.stages.length >= competition.stageDates.length && fixtures.every((f) => f.competitionId !== competition.id || f.result !== null);

/** The days a full-tier country's cup keeps off on a real calendar: its leagues' of `season` and UEFA's cups'. */
export function fullTierDaysOf(country: string, competitions: Record<string, Competition>, season: number, formats: Formats): FullTierDays {
  const leagues = Object.values(competitions).filter((c) => c.kind === "league" && c.season === season && c.abroad?.country === country);
  return { taken: [...leagues.flatMap((league) => league.stageDates.flat()), ...uefaMatchDays(season, formats)] };
}

/** The country's full-tier leagues of `season`, top level first. */
function leaguesOf(state: Pick<GameState, "competitions">, country: string, season: number): LeagueCompetition[] {
  return Object.values(state.competitions)
    .flatMap((c) => (c.kind === "league" && c.season === season && c.abroad?.country === country ? [c] : []))
    .sort((a, b) => (a.abroad?.level ?? 0) - (b.abroad?.level ?? 0));
}

/**
 * One full-tier country's turn: the season its leagues just finished filed from their final tables, its
 * clubs moved through the pyramid, the next season's leagues opened over its window and its cup reopened
 * here, and its boards' targets set for the new season. The finished leagues stay until Brazil's turn of
 * the year, whose review of the coaches reads them.
 */
function turnCountry(state: GameState, id: string, country: Country, season: number): GameState {
  const finished = leaguesOf(state, id, season - 1);
  const fixturesOf = (league: LeagueCompetition) => state.fixtures.filter((f) => f.competitionId === league.id);
  if (!finished.length || !finished.every((league) => isFinished(league, fixturesOf(league)))) return state;
  const tables = finished.map((league) => finalOrderOf(league, fixturesOf(league)));
  const { moves } = seasonMoves(country.structure, tables);
  const clubs: Record<string, Club> = { ...state.clubs };
  for (const [clubId, level] of moves) {
    const club = clubs[clubId];
    if (club?.abroad && level !== null) clubs[clubId] = { ...club, abroad: { ...club.abroad, level } };
  }
  const formats = formatsOf(state);
  const random = randomStream(country.rngState);
  const days = { formats, restsInFifaWindows: state.nations !== undefined, playsClubWorldCup: state.guests !== undefined };
  const competitions = { ...state.competitions };
  const fixtures = [...state.fixtures];
  for (const league of leaguesAbroad(country.structure, clubs, season, days, random.next)) {
    const opened = openNextStage(league, [], {});
    competitions[league.id] = opened.competition;
    fixtures.push(...opened.fixtures);
  }
  const filed = fileFullTierSeason({ ...country, rngState: random.state() }, tables, season, undefined, fullTierDaysOf(id, competitions, season, formats));
  const turned: GameState = { ...state, clubs, competitions, fixtures, world: { ...state.world, [id]: filed } };
  const { boards } = boardExpectations(turned);
  const ownBoards = Object.fromEntries(Object.entries(boards).filter(([clubId]) => clubs[clubId]?.abroad?.country === id));
  return { ...turned, boards: { ...state.boards, ...ownBoards } };
}

/**
 * The full-tier countries whose season crosses the new year, turned on their rollover day (`date`, a
 * real calendar's 1 July) once their leagues are played; the same game on any other day.
 */
export function turnSeasonsAbroad(state: GameState, date: IsoDate): GameState {
  let next = state;
  for (const [id, country] of Object.entries(state.world ?? {})) {
    if (turnsOnItsOwn(country) && country.structure.rollover === date.slice(5)) next = turnCountry(next, id, country, Number(date.slice(0, 4)));
  }
  return next;
}
