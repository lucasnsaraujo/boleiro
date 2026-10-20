import { LEAGUE_FORMATS } from "../leagueFormats.js";
import { STATE_CHAMPIONSHIP } from "../stateChampionship.js";
import { TIE_WIN_CHANCE } from "./expectedCopaPrize.js";
/** Clubs playing each stage of a league or state championship. */
function stageSizes(competition) {
    const clubCount = competition.clubIds.length;
    if (competition.kind === "league")
        return LEAGUE_FORMATS[competition.format].stageSizes(clubCount);
    if (competition.kind === "state")
        return STATE_CHAMPIONSHIP.stageSizes(clubCount);
    return [];
}
/**
 * Home games each club can expect over the season: the fixtures already drawn, plus an expected
 * value for every stage not drawn yet. A club plays half a stage's dates at home, whether the stage
 * is a group or a knockout tie. guess: in leagues and state championships every club is equally
 * likely to reach a later stage (its share of the field that gets there); in the Copa do Brasil a
 * club wins each tie half the time, as expectedCopaPrize assumes, and is sure to play the stage it
 * enters at.
 */
export function expectedHomeGames(competitions, fixtures) {
    const games = new Map();
    const add = (clubId, count) => games.set(clubId, (games.get(clubId) ?? 0) + count);
    for (const f of fixtures)
        add(f.homeId, 1);
    for (const competition of competitions) {
        const sizes = stageSizes(competition);
        competition.stageDates.forEach((dates, stage) => {
            if (stage < competition.stages.length)
                return;
            const homeGames = dates.length / 2;
            if (competition.kind === "cup") {
                competition.entries.forEach((entrants, entryStage) => {
                    if (entryStage > stage)
                        return;
                    const reach = TIE_WIN_CHANCE ** (stage - entryStage);
                    for (const id of entrants)
                        add(id, reach * homeGames);
                });
                return;
            }
            const reach = (sizes[stage] ?? 0) / competition.clubIds.length;
            for (const id of competition.clubIds)
                add(id, reach * homeGames);
        });
    }
    return games;
}
