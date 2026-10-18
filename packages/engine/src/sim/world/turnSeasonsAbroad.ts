import type { Club } from "@boleiro/data/clubs";
import { randomStream } from "../../engine/random.js";
import { boardExpectations } from "../coach/boardExpectations.js";
import { uefaMatchDays } from "../continental/uefaCups.js";
import { formatsOf, type Formats } from "../formats.js";
import type { Competition, Fixture, GameState, IsoDate, LeagueCompetition } from "../gameState.js";
import { finalOrderOf, LEAGUE_FORMATS } from "../leagueFormats.js";
import { reviewCoachesAbroad, type CoachSeasonEvent } from "../coach/startCoachSeason.js";
import { openNextStage } from "../openNextStage.js";
import { leaguesAbroad } from "../startSeason.js";
import { fileFullTierSeason, seasonMoves, type FullTierDays } from "./resultOnlyWorld.js";
import type { Country } from "./world.js";
import type { TopScorer } from "../history/history.js";
import { topScorerOf } from "../history/topScorerOf.js";

/** Whether a full-tier country turns its season on its own day, apart from Brazil's 1 January: a season crossing the new year on a real calendar. */
export const turnsOnItsOwn = (country: Pick<Country, "structure" | "isFullTier">): boolean => country.isFullTier === true && country.structure.rollover !== undefined;

/** Whether every stage of the competition is drawn and every one of its `fixtures` played. */
export const isFinished = (competition: Competition, fixtures: readonly Fixture[]): boolean =>
  competition.stages.length >= competition.stageDates.length && fixtures.every((f) => f.competitionId !== competition.id || f.result !== null);

const UEFA_KEYS = ["champions-league", "europa-league", "uefa-super-cup"];
const UEFA_TURN = "07-01";

/** A country's competition keys: one per level of its pyramid ("gb-eng-1") and its cup's ("gb-eng-cup"). */
const keysOf = (id: string, country: Pick<Country, "structure">) => [...country.structure.levels.map((_, level) => `${id}-${level + 1}`), `${id}-cup`];

/**
 * The competitions whose seasons run past Brazil's turn of the year, by key: the leagues and cup of each
 * full-tier country turning on its own, and on a real calendar UEFA's cups. Their scorers' tallies carry
 * over the new year (closeSeasonHistory) and are filed at their own turn.
 */
export function keysTurningOnTheirOwn(state: Pick<GameState, "world" | "formats">): Set<string> {
  const keys = Object.entries(state.world ?? {}).flatMap(([id, country]) => (turnsOnItsOwn(country) ? keysOf(id, country) : []));
  return new Set(formatsOf(state).calendar === "unified" ? keys : [...keys, ...UEFA_KEYS]);
}

/** The game with the scorers' tallies of `keys` filed as the top scorers of the season last filed, which they were played in, and started afresh. */
function fileScorers(state: GameState, keys: readonly string[]): GameState {
  const { history } = state;
  const goals = { ...history.current.goals };
  const filed: Record<string, TopScorer> = {};
  for (const key of keys) {
    const tally = goals[key];
    if (!tally) continue;
    const top = topScorerOf(tally, state);
    if (top) filed[key] = top;
    Reflect.deleteProperty(goals, key);
  }
  const last = history.seasons.at(-1);
  if (Object.keys(goals).length === Object.keys(history.current.goals).length) return state;
  const seasons = last ? [...history.seasons.slice(0, -1), { ...last, topScorers: { ...last.topScorers, ...filed } }] : history.seasons;
  return { ...state, history: { ...history, seasons, current: { ...history.current, goals } } };
}

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
function turnCountry(before: GameState, id: string, country: Country, season: number): { state: GameState; events: CoachSeasonEvent[] } {
  const finished = leaguesOf(before, id, season - 1);
  const fixturesOf = (league: LeagueCompetition) => before.fixtures.filter((f) => f.competitionId === league.id);
  if (!finished.length || !finished.every((league) => isFinished(league, fixturesOf(league)))) return { state: before, events: [] };
  // Its coaches are reviewed on the season just played, before the boards set the next one's targets.
  const reviewed = reviewCoachesAbroad(before, id, finished.map((league) => LEAGUE_FORMATS[league.format].outcome(league, fixturesOf(league))));
  const state = fileScorers(reviewed.state, keysOf(id, country));
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
  return { state: { ...turned, boards: { ...state.boards, ...ownBoards } }, events: reviewed.events };
}

/**
 * The full-tier countries whose season crosses the new year, turned on their rollover day (`date`, a
 * real calendar's 1 July) once their leagues are played, with the reviews of the coach in the seat;
 * the same game on any other day.
 */
export function turnSeasonsAbroad(state: GameState, date: IsoDate): { state: GameState; events: CoachSeasonEvent[] } {
  // UEFA's season turns on a real calendar's 1 July, its scorers filed with the season they were played in.
  let next = date.slice(5) === UEFA_TURN && formatsOf(state).calendar !== "unified" ? fileScorers(state, UEFA_KEYS) : state;
  const events: CoachSeasonEvent[] = [];
  for (const [id, country] of Object.entries(state.world ?? {})) {
    if (!turnsOnItsOwn(country) || country.structure.rollover !== date.slice(5)) continue;
    const turned = turnCountry(next, id, country, Number(date.slice(0, 4)));
    next = turned.state;
    events.push(...turned.events);
  }
  return { state: next, events };
}
