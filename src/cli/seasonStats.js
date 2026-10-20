import { divisionGap } from "../engine/cupUpsets.js";
import { cardsPerGame } from "../sim/discipline/cardsPerGame.js";
import { MATCH_HOURS } from "../sim/players/matchInjuryChance.js";
import { foreignShare } from "./foreignShare.js";
import { emptyFlow, tallyMove } from "./transferFlow.js";
import { clubSeasonsOf } from "./seasonRevenues.js";
const CARD_COMPETITIONS = ["A", "B", "C", "D", "cup", "state"];
const STARTERS = 11;
const emptyResults = () => ({ matches: 0, home: 0, draw: 0, away: 0, goals: 0 });
/** Realism numbers for one finished season. */
export function seasonStats({ before, after, fixtures, injuries, moves }) {
    const results = { A: emptyResults(), B: emptyResults(), C: emptyResults(), D: emptyResults() };
    const cupUpsets = {};
    // Clubs below Série D count as Série D, as in the real cup data (cupDivision).
    const divisionOf = (clubId) => before.clubs[clubId]?.division ?? "D";
    const clubs = new Set();
    for (const fixture of fixtures) {
        const competition = before.competitions[fixture.competitionId];
        const result = fixture.result;
        if (!competition || !result)
            continue;
        clubs.add(fixture.homeId).add(fixture.awayId);
        const goals = result.homeGoals + result.awayGoals;
        if (competition.kind === "league") {
            const tally = results[competition.division];
            tally.matches++;
            tally.goals += goals;
            tally[result.homeGoals > result.awayGoals ? "home" : result.homeGoals === result.awayGoals ? "draw" : "away"]++;
        }
        if (competition.kind === "cup") {
            const home = divisionOf(fixture.homeId);
            const gap = divisionGap(home, divisionOf(fixture.awayId));
            if (!gap)
                continue;
            const venue = gap.startsWith(home) ? "home" : "away";
            const [own, other] = venue === "home" ? [result.homeGoals, result.awayGoals] : [result.awayGoals, result.homeGoals];
            const tally = cupUpsets[`${gap}-${venue}`] ?? { matches: 0, win: 0, draw: 0, loss: 0, goals: 0 };
            tally.matches++;
            tally.goals += goals;
            tally[own > other ? "win" : own === other ? "draw" : "loss"]++;
            cupUpsets[`${gap}-${venue}`] = tally;
        }
    }
    const cards = {};
    const perGame = cardsPerGame(fixtures, before.competitions);
    for (const key of CARD_COMPETITIONS) {
        const rates = perGame[key];
        if (rates)
            cards[key] = { games: rates.games, yellows: rates.yellows * rates.games, reds: rates.reds * rates.games };
    }
    return {
        season: before.season,
        results,
        cupUpsets,
        cards,
        clubSeasons: clubSeasonsOf(before, after),
        flow: { ...moves.reduce(tallyMove, emptyFlow(before.season)), foreignShare: foreignShare(before) },
        injuries: { injuries: injuries.length, clubs: clubs.size, starterHours: fixtures.length * 2 * STARTERS * MATCH_HOURS },
    };
}
