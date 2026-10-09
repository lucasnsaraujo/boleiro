import type { Club, State } from "../data/clubs.js";
import type { Division } from "../data/players.js";
import type { Competition, Fixture, LeagueCompetition, LeagueFormatId, SeasonCalendar } from "./gameState.js";
import { LEAGUE_FORMATS } from "./leagueFormats.js";
import { openNextStage } from "./openNextStage.js";
import { seasonCalendar } from "./seasonCalendar.js";
import { shuffle } from "./shuffle.js";

const DIVISIONS: readonly Division[] = ["A", "B", "C", "D"];
const FORMATS: Record<Division, LeagueFormatId> = { A: "serie-a", B: "serie-b", C: "serie-c", D: "serie-d" };

export type SeasonStart = { calendar: SeasonCalendar; competitions: Record<string, Competition>; fixtures: Fixture[] };

export function startSeason(season: number, clubs: Record<string, Club>, random: () => number): SeasonStart {
  const clubStates: Record<string, State> = Object.fromEntries(Object.values(clubs).map((club) => [club.id, club.state]));
  const members = (division: Division) =>
    Object.values(clubs).filter((club) => club.division === division).map((club) => club.id).sort();
  const stageCounts = (division: Division) => LEAGUE_FORMATS[FORMATS[division]].stageDateCounts(members(division).length);
  const total = (division: Division) => stageCounts(division).reduce((sum, n) => sum + n, 0);
  const calendar = seasonCalendar(season, { A: total("A"), B: total("B"), C: total("C"), D: total("D") });
  const competitions: Record<string, Competition> = {};
  const fixtures: Fixture[] = [];
  for (const division of DIVISIONS) {
    const clubIds = shuffle(members(division), random);
    const dates = calendar.leagueDates[division];
    let offset = 0;
    const stageDates = stageCounts(division).map((count) => dates.slice(offset, (offset += count)));
    const league: LeagueCompetition = {
      id: `${FORMATS[division]}-${season}`,
      kind: "league",
      format: FORMATS[division],
      division,
      season,
      clubIds,
      stages: [],
      stageDates,
      drawOrder: shuffle(clubIds, random),
    };
    const opened = openNextStage(league, [], clubStates);
    competitions[league.id] = opened.competition;
    fixtures.push(...opened.fixtures);
  }
  return { calendar, competitions, fixtures };
}
