import { expect } from "vitest";
import { loadFinances } from "../data/finances.js";
const TIERS = ["A", "B", "C", "D", "state"];
const ABOVE = { A: "A", B: "A", C: "B", D: "C", state: "D" };
const operating = (f) => f.revenue.total - f.revenue.playerSales;
/** Every club's revenue stays between half its division's smallest and the richest of the division above. */
export function expectRevenueInDivisionBand(clubSeasons, ended) {
    const data = loadFinances();
    const smallest = (tier) => tier === "A"
        ? Math.min(...data.clubs.map(operating))
        : tier === "state"
            ? ended.economy.typicalRevenue.state
            : Math.min(...data.divisionEstimates.filter((row) => row.division === tier).map(operating));
    for (const tier of TIERS) {
        const ceiling = ended.economy.revenueCeiling[ABOVE[tier]] * (tier === "A" ? 1.5 : 1);
        for (const season of clubSeasons.filter((c) => c.tier === tier)) {
            expect(season.revenue, `${season.clubId} ${season.season}`).toBeGreaterThanOrEqual(0.5 * smallest(tier));
            expect(season.revenue, `${season.clubId} ${season.season}`).toBeLessThanOrEqual(ceiling);
        }
    }
}
/** Each division's median revenue stays within a factor of two of its typical club. */
export function expectMedianRevenueNearTypical(clubSeasons, ended) {
    for (const tier of TIERS.filter((t) => t !== "A")) {
        const values = clubSeasons.filter((c) => c.tier === tier).map((c) => c.revenue).sort((a, b) => a - b);
        const median = values[values.length >> 1] ?? 0;
        expect(median / ended.economy.typicalRevenue[tier]).toBeGreaterThan(0.5);
        expect(median / ended.economy.typicalRevenue[tier]).toBeLessThan(2);
    }
}
/** No club holds more than three years of its revenue in cash after the last season. */
export function expectNoCashHoarding(clubSeasons, ended) {
    const last = clubSeasons.filter((c) => c.season === ended.season - 1);
    for (const club of last)
        expect(club.cash, club.clubId).toBeLessThanOrEqual(3 * club.revenue);
}
