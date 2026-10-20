import { STATES } from "../data/clubs.js";
import { copaDoBrasilEntrants, nationalRanking } from "./copaDoBrasilEntrants.js";
import { LEAGUE_FORMATS } from "./leagueFormats.js";
import { openNextStage } from "./openNextStage.js";
import { seasonCalendar } from "./seasonCalendar.js";
import { shuffle } from "./shuffle.js";
import { STATE_CHAMPIONSHIP } from "./stateChampionship.js";
const DIVISIONS = ["A", "B", "C", "D"];
const FORMATS = { A: "serie-a", B: "serie-b", C: "serie-c", D: "serie-d" };
/** The clubs joining the season's Copa do Brasil at each stage. */
export const cupEntriesOf = (competitions) => Object.values(competitions).flatMap((c) => (c.kind === "cup" ? c.entries : []));
/** Opens every competition of the season. `qualification` is what last season's estaduais and leagues decided. */
export function startSeason(season, clubs, random, qualification) {
    const clubStates = Object.fromEntries(Object.values(clubs).map((club) => [club.id, club.state]));
    const members = (division) => Object.values(clubs).filter((club) => club.division === division).map((club) => club.id).sort();
    const stageCounts = (division) => LEAGUE_FORMATS[FORMATS[division]].stageDateCounts(members(division).length);
    const total = (division) => stageCounts(division).reduce((sum, n) => sum + n, 0);
    const calendar = seasonCalendar(season, { A: total("A"), B: total("B"), C: total("C"), D: total("D") });
    const competitions = {};
    const fixtures = [];
    const open = (competition) => {
        const opened = openNextStage(competition, [], clubStates);
        competitions[competition.id] = opened.competition;
        fixtures.push(...opened.fixtures);
    };
    for (const division of DIVISIONS) {
        const clubIds = shuffle(members(division), random);
        const dates = calendar.leagueDates[division];
        let offset = 0;
        const stageDates = stageCounts(division).map((count) => dates.slice(offset, (offset += count)));
        const league = {
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
        open(league);
    }
    const ranking = nationalRanking(Object.values(clubs));
    for (const state of STATES) {
        const inState = new Set(Object.values(clubs).filter((club) => club.state === state).map((club) => club.id));
        const seeding = [...(qualification.statePlacings[state] ?? []), ...ranking].filter((id, i, all) => inState.has(id) && all.indexOf(id) === i);
        if (seeding.length < 2)
            continue;
        const championship = {
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
    const cup = {
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
