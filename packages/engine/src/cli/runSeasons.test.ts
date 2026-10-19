import { beforeAll, describe, expect, it } from "vitest";
import { advanceDay } from "../sim/advanceDay.js";
import type { GameState } from "../sim/gameState.js";
import { MATCH_INJURIES_PER_HOUR } from "../sim/players/matchInjuryChance.js";
import { loadGame, saveGame } from "../sim/saveGame.js";
import { realismReport } from "./realismReport.js";
import { expectMedianRevenueNearTypical, expectNoCashHoarding, expectRevenueInDivisionBand } from "./revenueBandChecks.js";
import { runSeasons, type SeasonRun } from "./runSeasons.js";
import { seasonReport } from "./seasonReport.js";
import { expectDivisionsApart, expectMeanAgeSteady, expectMeanStrengthSteady, expectSerieDStrengthSteady, expectSpreadSettles } from "./strengthBandChecks.js";
import { expectDomesticMoves, expectForeignersMostlyInSerieA, expectSerieAForeignShareNearReal, expectTalentToEurope } from "./transferFlowChecks.js";

const playDays = (state: GameState, days: number) => {
  let current = state;
  for (let i = 0; i < days; i++) current = advanceDay(current, {}).state;
  return current;
};

/** Saves and loads the state at every season start, checks it is unchanged and plays on the same, then continues from the loaded copy. */
function roundTrip(state: GameState): GameState {
  const loaded = loadGame(saveGame(state));
  expect(loaded).toStrictEqual(state);
  expect(playDays(loaded, 15)).toStrictEqual(playDays(state, 15));
  return loaded;
}

/** Plays the seasons once, before the checks that read them. */
function seasonRun(seasons: number): () => SeasonRun {
  let run: SeasonRun | undefined;
  beforeAll(() => {
    run = runSeasons(4, seasons, roundTrip);
  }, 60_000 * seasons);
  return () => {
    if (!run) throw new Error(`the ${seasons} seasons did not run`);
    return run;
  };
}

const clubSeasonsOf = (run: SeasonRun) => run.seasons.flatMap((s) => s.stats.clubSeasons);
const flowsOf = (run: SeasonRun) => run.seasons.map((s) => s.stats.flow);

/**
 * Match injuries per starter hour stay at the UEFA injury study's 27.5 per 1000 h (Ekstrand, Hägglund &
 * Waldén 2011), which already counts re-injuries, plus up to 15% for fatigue, artificial pitches and
 * injury-prone players; re-injuries are 12% of all injuries in that study and 10% in the UEFA Elite Club
 * Injury Study's 18 seasons (Ekstrand et al. 2021).
 */
function expectInjuriesAtStudyRate(run: SeasonRun) {
  for (const { injuries } of run.seasons.map((s) => s.stats)) {
    expect(injuries.injuries / injuries.starterHours).toBeGreaterThan(MATCH_INJURIES_PER_HOUR);
    expect(injuries.injuries / injuries.starterHours).toBeLessThan(MATCH_INJURIES_PER_HOUR * 1.15);
    expect(injuries.recurrences / injuries.injuries).toBeGreaterThan(0.07);
    expect(injuries.recurrences / injuries.injuries).toBeLessThan(0.15);
  }
}

function expectSeasonsPlayed(run: SeasonRun, seasons: number) {
  expect(run.seasons.map((s) => s.summary.season)).toEqual(Array.from({ length: seasons }, (_, i) => 2026 + i));
  expect(run.final.season).toBe(2026 + seasons);
}

// The checks below are the ten-season band checks of seasonRevenues, strengthBySeason and transferFlow,
// run on the same seasons that went through a save and load. The short run skips the ones that need a
// long run: the spread and Série D drift compare a settled season with the last.
describe("two seasons from the season runner", () => {
  const run = seasonRun(2);

  it("plays both seasons with a JSON save and load at every season start", () => {
    expectSeasonsPlayed(run(), 2);
  });

  it("keeps club revenue inside each division's band, and no club hoarding three years of it in cash", () => {
    expectRevenueInDivisionBand(clubSeasonsOf(run()), run().final);
    expectMedianRevenueNearTypical(clubSeasonsOf(run()), run().final);
    expectNoCashHoarding(clubSeasonsOf(run()), run().final);
  });

  it("keeps player strength and age steady and the divisions apart", () => {
    expectMeanStrengthSteady(run().strength);
    expectDivisionsApart(run().strength);
    expectMeanAgeSteady(run().strength);
  });

  it("moves players at home and abroad and keeps foreigners mostly in Série A", () => {
    expectTalentToEurope(flowsOf(run()));
    expectForeignersMostlyInSerieA(flowsOf(run()));
    expectDomesticMoves(flowsOf(run()));
  });

  it("injures players at the UEFA study's rate, re-injuries included, season after season", () => {
    expectInjuriesAtStudyRate(run());
  });

  it("prints the tables, winners, movements, transfers and money of a season", () => {
    const text = seasonReport(run().seasons[0]?.summary ?? null).join("\n");
    expect(text).toMatch(/^## 2026/);
    expect(text).toMatch(/Série A: 1 \S.* \d+, 2 /);
    expect(text).toMatch(/Série D: 1 \S/);
    expect(text).toMatch(/Copa do Brasil: \S/);
    expect(text).toMatch(/Estaduais: AC \S.*, RJ \S.*, SP \S/);
    expect(text).toMatch(/promoted to A: .*; to B: .*; to C: /);
    expect(text).toMatch(/relegated from A: .*; from D: \d+ clubs/);
    expect(text).toMatch(/top transfers: \S.* \(.* → .*\) R\$ [\d.]+M/);
    expect(text).toMatch(/\| A \| \d+ \| R\$ [\d.,]+M \|/);
    expect(text).toMatch(/richest: .* R\$ [\d.-]+M.*; poorest: /);
  });

  it("compares results, cup upsets, cards, revenue, foreign players and injuries with real life", () => {
    const text = realismReport(run().seasons.map((s) => s.stats)).join("\n");
    for (const heading of ["Results per division", "Copa do Brasil upsets", "Cards per game", "Revenue per division", "Foreign players", "Injuries"]) {
      expect(text).toContain(`### ${heading}`);
    }
    expect(text).toMatch(/\| Série D \| \d+ \| [\d.]+% \| [\d.]+% \|/);
    expect(text).toMatch(/\| AvD \| home \| \d+ \| \d+% \|/);
    expect(text).toMatch(/\| Série A \| \d+ \| [\d.]+ \| [\d.]+ \|/);
  });
});

// Ten seasons with a save and load each take a couple of minutes, so they only run with LONG_RUN=1 (`pnpm test:long`).
describe.skipIf(!process.env.LONG_RUN)("ten seasons from the season runner", () => {
  const run = seasonRun(10);

  it("plays ten seasons with a JSON save and load at every season start", () => {
    expectSeasonsPlayed(run(), 10);
  });

  it("keeps club revenue inside each division's band", () => {
    expectRevenueInDivisionBand(clubSeasonsOf(run()), run().final);
    expectMedianRevenueNearTypical(clubSeasonsOf(run()), run().final);
    expectNoCashHoarding(clubSeasonsOf(run()), run().final);
  });

  it("keeps each division's mean strength within its drift band", () => {
    expectMeanStrengthSteady(run().strength);
    expectSerieDStrengthSteady(run().strength);
  });

  it("keeps the divisions apart", () => {
    expectDivisionsApart(run().strength);
  });

  it("stops the strength spread from growing", () => {
    expectSpreadSettles(run().strength);
  });

  it("keeps the mean age steady", () => {
    expectMeanAgeSteady(run().strength);
  });

  it("moves players at home and abroad and keeps foreigners mostly in Série A", () => {
    expectTalentToEurope(flowsOf(run()));
    expectForeignersMostlyInSerieA(flowsOf(run()));
    expectDomesticMoves(flowsOf(run()));
  });

  it("keeps Série A's foreign share near the real 23% every season", () => {
    expectSerieAForeignShareNearReal(flowsOf(run()));
  });
});
