import { tieResults } from "../tieResults.js";
import { creditPrize } from "./creditPrize.js";
import { tierOf } from "./tierOf.js";
const LOWER_DIVISION_TIERS = new Set(["C", "D", "state"]);
/**
 * Pays Copa do Brasil prizes for today's played cup fixtures: each club's prize for a stage when it
 * plays that stage's first match, and the final's prizes once the final is decided. Série C, D and
 * state-only clubs get the smaller early-round prize (CBF 2026 table, data/competition-money.json).
 */
export function payCopaPrizes(state, played) {
    const { stagePrizes, runnerUp, champion } = state.economy.copaDoBrasil;
    const events = [];
    let next = state;
    const pay = (clubId, competitionId, amount) => {
        next = creditPrize(next, clubId, amount);
        events.push({ type: "prizePaid", clubId, competitionId, amount });
    };
    for (const fixture of played) {
        const competition = state.competitions[fixture.competitionId];
        const stage = competition?.stages[fixture.stage];
        if (competition?.kind !== "cup" || stage?.kind !== "knockout")
            continue;
        const stagePrize = stagePrizes[fixture.stage];
        if (stagePrize && fixture.date === stage.dates[0]) {
            for (const clubId of [fixture.homeId, fixture.awayId]) {
                const club = state.clubs[clubId];
                const lower = club && LOWER_DIVISION_TIERS.has(tierOf(club)) ? stagePrize.prizeLowerDivisions : null;
                pay(clubId, competition.id, lower ?? stagePrize.prize);
            }
        }
        if (fixture.stage === competition.stageDates.length - 1 && fixture.date === stage.dates.at(-1)) {
            const final = tieResults(stage, [fixture])[0];
            if (!final)
                continue;
            pay(final.winnerId, competition.id, champion);
            pay(final.loserId, competition.id, runnerUp);
        }
    }
    return { state: next, events };
}
