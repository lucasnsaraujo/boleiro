import { beforeAll, describe, expect, it } from "vitest";
import { transferFlow, type SeasonFlow } from "./transferFlow.js";
import { expectDomesticMoves, expectForeignersMostlyInSerieA, expectSerieAForeignShareNearReal, expectTalentToEurope } from "./transferFlowChecks.js";

// Ten seasons take most of a minute, so this only runs with LONG_RUN=1 (`pnpm test:long`).
describe.skipIf(!process.env.LONG_RUN)("ten seasons of transfers", () => {
  let flows: SeasonFlow[] = [];
  beforeAll(() => {
    ({ flows } = transferFlow(2, 10));
  }, 300_000);

  it("covers ten seasons", () => {
    expect(flows).toHaveLength(10);
  });

  it("sends Brazilian talent to Europe every season", () => {
    expectTalentToEurope(flows);
  });

  it("keeps foreigners in Série A and rare in the lower divisions", () => {
    expectForeignersMostlyInSerieA(flows);
  });

  it("keeps Série A's foreign share near the real 23% every season", () => {
    expectSerieAForeignShareNearReal(flows);
  });

  it("moves players between Brazilian clubs every season, for fees and for free", () => {
    expectDomesticMoves(flows);
  });
});
