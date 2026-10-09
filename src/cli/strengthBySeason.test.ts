import { beforeAll, describe, it } from "vitest";
import { expectDivisionsApart, expectMeanAgeSteady, expectMeanStrengthSteady, expectSerieDStrengthSteady, expectSpreadSettles } from "./strengthBandChecks.js";
import { strengthBySeason, type StrengthBand } from "./strengthBySeason.js";

// About a minute with the transfer market, so it only runs with LONG_RUN=1 (`pnpm test:long`).
describe.skipIf(!process.env.LONG_RUN)("ten seasons of player strength", () => {
  let bands: StrengthBand[] = [];
  beforeAll(() => {
    ({ bands } = strengthBySeason(1, 10));
  }, 300_000);

  it("keeps each division's mean strength within 3 points of where it started", () => {
    expectMeanStrengthSteady(bands);
  });

  it("keeps Série D's mean strength within 4 points while its clubs churn", () => {
    expectSerieDStrengthSteady(bands);
  });

  it("keeps the divisions in order, at least 5 points apart", () => {
    expectDivisionsApart(bands);
  });

  it("stops the spread from growing once the squads have mixed", () => {
    expectSpreadSettles(bands);
  });

  it("keeps the mean age steady", () => {
    expectMeanAgeSteady(bands);
  });
});
