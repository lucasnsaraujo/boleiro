import { beforeAll, describe, expect, it } from "vitest";
import { expectSerieACallUpsNearReal, expectWorldCupSerieANearReal } from "./callUpChecks.js";
import { callUpsBySeason, type WindowCallUps } from "./callUpsBySeason.js";

// Ten seasons of national football take a couple of minutes, so they only run with LONG_RUN=1 (`pnpm test:long`).
describe.skipIf(!process.env.LONG_RUN)("ten seasons of national call-ups", () => {
  let windows: WindowCallUps[] = [];
  beforeAll(() => {
    windows = callUpsBySeason(2, 10);
  }, 600_000);

  it("covers four FIFA windows a season", () => {
    expect(windows).toHaveLength(40);
  });

  it("calls about as many Série A players a window as national teams really do", () => {
    expectSerieACallUpsNearReal(windows);
  });

  it("takes about as many Série A players to a World Cup as went to the 2026 one", () => {
    expectWorldCupSerieANearReal(windows);
  });
});
