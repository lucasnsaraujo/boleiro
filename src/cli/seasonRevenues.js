import { advanceDay } from "../sim/advanceDay.js";
import { totalRevenue } from "../sim/finances/ledger.js";
import { tierOf } from "../sim/finances/tierOf.js";
import { loadNewGame } from "../sim/loadNewGame.js";
/** Each club's books for the season that ended between `before` (its last day) and `after`. */
export function clubSeasonsOf(before, after) {
    return Object.entries(after.finances).flatMap(([clubId, finance]) => {
        const club = before.clubs[clubId];
        if (!club || !finance.lastSeason)
            return [];
        const playerSales = finance.lastSeason.revenue.playerSales;
        return [{
                season: before.season,
                clubId,
                tier: tierOf(club),
                revenue: totalRevenue(finance.lastSeason) - playerSales,
                playerSales,
                cash: finance.cash,
                loans: finance.loans,
                lateWageMonths: finance.lateWageMonths,
            }];
    });
}
/** Plays `seasons` whole seasons with no coach and returns each club's books for every season. */
export function seasonRevenues(seed, seasons) {
    let state = loadNewGame(seed, { coachClubId: null });
    const clubSeasons = [];
    let forcedSales = 0;
    let lateWageClosings = 0;
    const lastSeason = state.season + seasons - 1;
    while (state.season <= lastSeason) {
        const before = state;
        const day = advanceDay(state, {});
        state = day.state;
        forcedSales += day.events.filter((e) => e.type === "forcedSale").length;
        lateWageClosings += day.events.filter((e) => e.type === "wagesLate").length;
        if (day.events.some((e) => e.type === "seasonEnded"))
            clubSeasons.push(...clubSeasonsOf(before, state));
    }
    return { clubSeasons, forcedSales, lateWageClosings, state };
}
