import { expect } from "vitest";
import type { SeasonFlow } from "./transferFlow.js";

// Brazil sells dozens of players with real fees to Europe every year; Europe here buys only
// strong players under 27, so a season should send at least ten and no more than 150.
/** Europe buys Brazilian talent every season. */
export function expectTalentToEurope(flows: readonly SeasonFlow[]): void {
  for (const flow of flows) {
    expect(flow.toEurope, `${flow.season}`).toBeGreaterThanOrEqual(10);
    expect(flow.toEurope, `${flow.season}`).toBeLessThanOrEqual(150);
  }
}

// 2026 squads (data/players.csv): 23% of Série A players are foreign, 7% of Série B, under 2% below.
/** Foreigners stay in Série A and rare in the lower divisions. */
export function expectForeignersMostlyInSerieA(flows: readonly SeasonFlow[]): void {
  for (const { season, foreignShare } of flows) {
    expect(foreignShare.A, `${season}`).toBeGreaterThan(0.1);
    expect(foreignShare.A, `${season}`).toBeLessThan(0.35);
    for (const tier of ["C", "D", "state"] as const) expect(foreignShare[tier], `${tier} ${season}`).toBeLessThan(0.05);
  }
}

// data/players.csv's 2026 Série A squads are 23.4% foreign (157 of 672 players).
/** Série A's foreign share stays between 18% and 30% every season, near the real 23%. */
export function expectSerieAForeignShareNearReal(flows: readonly SeasonFlow[]): void {
  for (const { season, foreignShare } of flows) {
    expect(foreignShare.A, `${season}`).toBeGreaterThan(0.18);
    expect(foreignShare.A, `${season}`).toBeLessThan(0.3);
  }
}

/** Players move between Brazilian clubs every season, for fees, as free agents and on loan. */
export function expectDomesticMoves(flows: readonly SeasonFlow[]): void {
  for (const flow of flows) {
    expect(flow.domestic, `${flow.season}`).toBeGreaterThan(0);
    expect(flow.freeAgents, `${flow.season}`).toBeGreaterThan(0);
    expect(flow.loans, `${flow.season}`).toBeGreaterThan(0);
  }
}
