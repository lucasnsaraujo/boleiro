import { describe, expect, it } from "vitest";
import { loadTeams } from "../data/players.js";
import { realDivisionRates, realSerieARates, simulatedSeasonRates } from "./calibration.js";
import { paramsForDivision } from "./paramsForDivision.js";

describe("calibration against real Série A", () => {
  const real = realSerieARates();
  const simulated = simulatedSeasonRates(loadTeams("A"));

  it("matches the real home, draw and away rates within two points", () => {
    expect(Math.abs(simulated.home - real.home)).toBeLessThan(0.02);
    expect(Math.abs(simulated.draw - real.draw)).toBeLessThan(0.02);
    expect(Math.abs(simulated.away - real.away)).toBeLessThan(0.02);
  });

  it("scores as many goals per game as the real league", () => {
    expect(Math.abs(simulated.goalsPerGame - real.goalsPerGame)).toBeLessThan(0.1);
  });

  it("spreads favourites like the betting market does", () => {
    expect(Math.abs(simulated.homeWinP10 - real.homeWinP10)).toBeLessThan(0.04);
    expect(Math.abs(simulated.homeWinP90 - real.homeWinP90)).toBeLessThan(0.04);
  });
});

// Série B 2022–2026 has 1,840 games and Série C 2022–2025 864, so two points is
// about two standard errors. Série D has only the 2024 season (about 510 games), where two
// standard errors on a 30% share is four points, so its tolerances are twice as wide.
const DIVISION_TOLERANCE = {
  B: { share: 0.02, goals: 0.1 },
  C: { share: 0.025, goals: 0.1 },
  D: { share: 0.04, goals: 0.2 },
} as const;

describe.each(["B", "C", "D"] as const)("calibration against real Série %s", (division) => {
  const real = realDivisionRates(division);
  const simulated = simulatedSeasonRates(loadTeams(division), paramsForDivision(division));
  const tolerance = DIVISION_TOLERANCE[division];

  it("matches the real home, draw and away rates", () => {
    expect(Math.abs(simulated.home - real.home)).toBeLessThan(tolerance.share);
    expect(Math.abs(simulated.draw - real.draw)).toBeLessThan(tolerance.share);
    expect(Math.abs(simulated.away - real.away)).toBeLessThan(tolerance.share);
  });

  it("scores as many goals per game as the real league", () => {
    expect(Math.abs(simulated.goalsPerGame - real.goalsPerGame)).toBeLessThan(tolerance.goals);
  });
});
