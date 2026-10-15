import { STATES, type Club, type State } from "@boleiro/data/clubs";
import type { Division } from "@boleiro/data/players";
import { copaDoBrasilEntrants, nationalRanking, type Qualification } from "./copaDoBrasilEntrants.js";
import type { Competition, CupCompetition, Fixture, LeagueCompetition, SeasonCalendar, StateCompetition } from "./gameState.js";
import { LEAGUE_FORMATS } from "./leagueFormats.js";
import { openNextStage } from "./openNextStage.js";
import { seasonCalendar } from "./seasonCalendar.js";
import { shuffle } from "./shuffle.js";
import { STATE_CHAMPIONSHIP } from "./stateChampionship.js";
import { BRAZIL } from "./world/brazil.js";
import { continentalDates } from "./continental/conmebolCups.js";

/** The clubs joining the season's Copa do Brasil at each stage. */
export const cupEntriesOf = (competitions: Record<string, Competition>): string[][] =>
  Object.values(competitions).flatMap((c) => (c.kind === "cup" ? c.entries : []));

export type SeasonStart = { calendar: SeasonCalendar; competitions: Record<string, Competition>; fixtures: Fixture[] };

/**
 * Opens every competition of the season. `qualification` is what last season's estaduais and leagues decided;
 * without `playsStateChampionships` the estaduais are not played and their dates stay empty; with
 * `playsContinentalCups` Brazil's leagues keep clear of CONMEBOL's match days.
 */
export function startSeason(
  season: number,
  clubs: Record<string, Club>,
  random: () => number,
  qualification: Qualification,
  playsStateChampionships = true,
  playsContinentalCups = false,
): SeasonStart {
  const clubStates: Record<string, State> = Object.fromEntries(Object.values(clubs).map((club) => [club.id, club.state]));
  const levels = BRAZIL.levels.map((level) => {
    const members = Object.values(clubs).filter((club) => club.division === level.division).map((club) => club.id).sort();
    return { ...level, members, stageCounts: LEAGUE_FORMATS[level.format].stageDateCounts(members.length) };
  });
  const dateCounts = new Map(levels.map((level) => [level.division, level.stageCounts.reduce((sum, n) => sum + n, 0)]));
  const total = (division: Division) => dateCounts.get(division) ?? 0;
  const calendar = seasonCalendar(season, { A: total("A"), B: total("B"), C: total("C"), D: total("D") }, playsContinentalCups ? continentalDates(season) : []);
  const competitions: Record<string, Competition> = {};
  const fixtures: Fixture[] = [];
  const open = (competition: Competition) => {
    const opened = openNextStage(competition, [], clubStates);
    competitions[competition.id] = opened.competition;
    fixtures.push(...opened.fixtures);
  };
  for (const { division, format, members, stageCounts } of levels) {
    const clubIds = shuffle(members, random);
    const dates = calendar.leagueDates[division];
    let offset = 0;
    const stageDates = stageCounts.map((count) => dates.slice(offset, (offset += count)));
    const league: LeagueCompetition = {
      id: `${format}-${season}`,
      kind: "league",
      format,
      division,
      season,
      clubIds,
      stages: [],
      stageDates,
      drawOrder: shuffle(clubIds, random),
    };
    open(league);
  }
  const ranking = nationalRanking(Object.values(clubs));
  for (const state of playsStateChampionships ? STATES : []) {
    const inState = new Set(Object.values(clubs).filter((club) => club.state === state).map((club) => club.id));
    const seeding = [...(qualification.statePlacings[state] ?? []), ...ranking].filter((id, i, all) => inState.has(id) && all.indexOf(id) === i);
    if (seeding.length < 2) continue;
    const championship: StateCompetition = {
      id: `state-${state.toLowerCase()}-${season}`,
      kind: "state",
      state,
      season,
      clubIds: seeding,
      stages: [],
      stageDates: STATE_CHAMPIONSHIP.stageDates(seeding.length, calendar.stateChampionshipDates),
      drawOrder: shuffle(seeding, random),
    };
    open(championship);
  }
  const { clubIds, entries } = copaDoBrasilEntrants(clubs, qualification);
  const cup: CupCompetition = {
    id: `copa-do-brasil-${season}`,
    kind: "cup",
    season,
    clubIds,
    entries,
    stages: [],
    stageDates: calendar.copaDoBrasilRounds.map((round) => round.dates),
    drawOrder: shuffle(clubIds, random),
  };
  open(cup);
  return { calendar, competitions, fixtures };
}
