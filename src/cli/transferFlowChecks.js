import { expect } from "vitest";
// Brazil sells dozens of players with real fees to Europe every year; Europe here buys only
// strong players under 27, so a season should send at least ten and no more than 150.
/** Europe buys Brazilian talent every season. */
export function expectTalentToEurope(flows) {
    for (const flow of flows) {
        expect(flow.toEurope, `${flow.season}`).toBeGreaterThanOrEqual(10);
        expect(flow.toEurope, `${flow.season}`).toBeLessThanOrEqual(150);
    }
}
// 2026 squads (data/players.csv): 23% of Série A players are foreign, 7% of Série B, under 2% below.
/** Foreigners stay in Série A and rare in the lower divisions. */
export function expectForeignersMostlyInSerieA(flows) {
    for (const { season, foreignShare } of flows) {
        expect(foreignShare.A, `${season}`).toBeGreaterThan(0.1);
        expect(foreignShare.A, `${season}`).toBeLessThan(0.35);
        for (const tier of ["C", "D", "state"])
            expect(foreignShare[tier], `${tier} ${season}`).toBeLessThan(0.05);
    }
}
/** Players move between Brazilian clubs every season, for fees, as free agents and on loan. */
export function expectDomesticMoves(flows) {
    for (const flow of flows) {
        expect(flow.domestic, `${flow.season}`).toBeGreaterThan(0);
        expect(flow.freeAgents, `${flow.season}`).toBeGreaterThan(0);
        expect(flow.loans, `${flow.season}`).toBeGreaterThan(0);
    }
}
