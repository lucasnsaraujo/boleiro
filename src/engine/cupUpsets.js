import { loadDivisions, loadResults } from "../data/history.js";
import { matchOdds } from "./match.js";
/** ESPN has Série C standings from 2017; 2026 was still running when fetched. */
export const CUP_SEASONS = { first: 2017, last: 2025 };
export const DIVISION_GAPS = ["AvB", "AvC", "AvD", "BvC", "BvD", "CvD"];
const ORDER = ["A", "B", "C", "D"];
/** A club with no A–C (ESPN) or A–D (Sofascore) standing that season played Série D or below. */
export function cupDivision(divisions, match, side) {
    return divisions.get(match.season)?.get(match[side].ref) ?? "D";
}
export function divisionGap(a, b) {
    const [higher, lower] = ORDER.indexOf(a) < ORDER.indexOf(b) ? [a, b] : [b, a];
    const gap = `${higher}v${lower}`;
    return DIVISION_GAPS.find((known) => known === gap) ?? null;
}
export function realCupMatches() {
    return loadResults("copa-do-brasil").filter((m) => m.season >= CUP_SEASONS.first && m.season <= CUP_SEASONS.last);
}
export function realCupUpsets() {
    const divisions = loadDivisions();
    const tally = new Map();
    for (const match of realCupMatches()) {
        const home = cupDivision(divisions, match, "home");
        const away = cupDivision(divisions, match, "away");
        const gap = divisionGap(home, away);
        if (!gap)
            continue;
        const venue = gap.startsWith(home) ? "home" : "away";
        const [own, other] = venue === "home" ? [match.homeGoals, match.awayGoals] : [match.awayGoals, match.homeGoals];
        const key = `${gap}-${venue}`;
        const count = tally.get(key) ?? { win: 0, draw: 0, loss: 0, goals: 0 };
        count.goals += own + other;
        if (own > other)
            count.win++;
        else if (own === other)
            count.draw++;
        else
            count.loss++;
        tally.set(key, count);
    }
    return DIVISION_GAPS.flatMap((gap) => ["home", "away"].map((venue) => {
        const { win, draw, loss, goals } = tally.get(`${gap}-${venue}`) ?? { win: 0, draw: 0, loss: 0, goals: 0 };
        const matches = win + draw + loss;
        return { gap, venue, matches, win: win / matches, draw: draw / matches, loss: loss / matches, goalsPerGame: goals / matches };
    }));
}
/** Every pairing of a current higher-division squad with a current lower-division squad, at each venue. */
export function simulatedCupUpsets(squads, params) {
    return DIVISION_GAPS.flatMap((gap) => {
        const [higher, lower] = [gap[0], gap[2]];
        return ["home", "away"].map((venue) => {
            let win = 0;
            let draw = 0;
            let goals = 0;
            let matches = 0;
            for (const favourite of squads[higher]) {
                for (const underdog of squads[lower]) {
                    const odds = venue === "home" ? matchOdds(favourite, underdog, params) : matchOdds(underdog, favourite, params);
                    win += venue === "home" ? odds.home : odds.away;
                    draw += odds.draw;
                    goals += odds.expectedHomeGoals + odds.expectedAwayGoals;
                    matches++;
                }
            }
            return { gap, venue, matches, win: win / matches, draw: draw / matches, loss: 1 - (win + draw) / matches, goalsPerGame: goals / matches };
        });
    });
}
