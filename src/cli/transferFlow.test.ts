import { beforeAll, describe, expect, it } from "vitest";
import { transferFlow, type SeasonFlow } from "./transferFlow.js";

// Ten seasons take most of a minute, so this only runs with LONG_RUN=1 (`pnpm test:long`).
describe.skipIf(!process.env.LONG_RUN)("ten seasons of transfers", () => {
  let flows: SeasonFlow[] = [];
  beforeAll(() => {
    ({ flows } = transferFlow(1, 10));
  }, 300_000);

  it("covers ten seasons", () => {
    expect(flows).toHaveLength(10);
  });

  // Brazil sells dozens of players with real fees to Europe every year; Europe here buys only
  // strong players under 27, so a season should send at least ten and no more than 150.
  it("sends Brazilian talent to Europe every season", () => {
    for (const flow of flows) {
      expect(flow.toEurope, `${flow.season}`).toBeGreaterThanOrEqual(10);
      expect(flow.toEurope, `${flow.season}`).toBeLessThanOrEqual(150);
    }
  });

  // 2026 squads (data/players.csv): 23% of Série A players are foreign, 7% of Série B, under 2% below.
  it("keeps foreigners in Série A and rare in the lower divisions", () => {
    for (const { season, foreignShare } of flows) {
      expect(foreignShare.A, `${season}`).toBeGreaterThan(0.1);
      expect(foreignShare.A, `${season}`).toBeLessThan(0.35);
      for (const tier of ["C", "D", "state"] as const) expect(foreignShare[tier], `${tier} ${season}`).toBeLessThan(0.05);
    }
  });

  it("moves players between Brazilian clubs every season, for fees and for free", () => {
    for (const flow of flows) {
      expect(flow.domestic, `${flow.season}`).toBeGreaterThan(0);
      expect(flow.freeAgents, `${flow.season}`).toBeGreaterThan(0);
      expect(flow.loans, `${flow.season}`).toBeGreaterThan(0);
    }
  });
});
