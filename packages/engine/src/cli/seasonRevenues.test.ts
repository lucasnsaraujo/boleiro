import { beforeAll, describe, expect, it } from "vitest";
import type { GameState } from "../sim/gameState.js";
import { expectMedianRevenueNearTypical, expectNoCashHoarding, expectRevenueInDivisionBand } from "./revenueBandChecks.js";
import { seasonRevenues, type ClubSeason } from "./seasonRevenues.js";

// About a minute with the transfer market, so it only runs with LONG_RUN=1 (`pnpm test:long`).
describe.skipIf(!process.env.LONG_RUN)("ten seasons of club money", () => {
  let clubSeasons: ClubSeason[] = [];
  let state: GameState | undefined;
  beforeAll(() => {
    ({ clubSeasons, state } = seasonRevenues(1, 10));
  }, 300_000);
  const ended = (): GameState => {
    if (!state) throw new Error("the ten seasons did not run");
    return state;
  };

  it("covers ten seasons for every club", () => {
    expect(clubSeasons).toHaveLength(10 * Object.keys(ended().clubs).length);
  });

  it("keeps every club's revenue between half its division's smallest and the richest of the division above", () => {
    expectRevenueInDivisionBand(clubSeasons, ended());
  });

  it("keeps each division's median revenue within a factor of two of its typical club", () => {
    expectMedianRevenueNearTypical(clubSeasons, ended());
  });

  it("lets no club hoard more than three years of its revenue in cash", () => {
    expectNoCashHoarding(clubSeasons, ended());
  });
});
