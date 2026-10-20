import { expect } from "vitest";
const TIERS = ["A", "B", "C", "D"];
function reader(bands) {
    const band = (season, tier) => {
        const found = bands.find((b) => b.season === season && b.tier === tier);
        if (!found)
            throw new Error(`no ${tier} band in ${season}`);
        return found;
    };
    return { band, first: Math.min(...bands.map((b) => b.season)), last: Math.max(...bands.map((b) => b.season)) };
}
/** Série A–C mean strength stays within 3 points of where it started. */
export function expectMeanStrengthSteady(bands) {
    const { band, first, last } = reader(bands);
    for (const tier of ["A", "B", "C"])
        expect(Math.abs(band(last, tier).mean - band(first, tier).mean), tier).toBeLessThan(3);
}
// Each year about two thirds of Série D are replaced by estadual qualifiers (serieDQualifiers.ts),
// many of them state-only clubs whose players start near 42.
/** Série D's mean strength stays within 4 points while its clubs churn. */
export function expectSerieDStrengthSteady(bands) {
    const { band, first, last } = reader(bands);
    expect(Math.abs(band(last, "D").mean - band(first, "D").mean)).toBeLessThan(4);
}
/** The divisions stay in order, at least 5 points apart, every season. */
export function expectDivisionsApart(bands) {
    const { band, first, last } = reader(bands);
    for (let season = first; season <= last; season++) {
        const means = TIERS.map((tier) => band(season, tier).mean);
        means.slice(1).forEach((mean, i) => expect((means[i] ?? 0) - mean, `${season}`).toBeGreaterThan(5));
    }
}
/** The p90−p10 spread stops growing once the squads have mixed. */
export function expectSpreadSettles(bands) {
    const { band, first, last } = reader(bands);
    for (const tier of TIERS) {
        const spread = (season) => band(season, tier).p90 - band(season, tier).p10;
        // Estadual qualification swaps weaker state-only clubs into Série D a few at a time, so D settles by season 3.
        const settled = first + (tier === "D" ? 3 : 1);
        expect(spread(last), tier).toBeLessThan(spread(settled) + 2);
        expect(spread(last), tier).toBeGreaterThan(spread(first) - 2);
    }
}
/** Each division's mean age moves less than a year and a half. */
export function expectMeanAgeSteady(bands) {
    const { band, first, last } = reader(bands);
    for (const tier of TIERS)
        expect(Math.abs(band(last, tier).meanAge - band(first, tier).meanAge), tier).toBeLessThan(1.5);
}
