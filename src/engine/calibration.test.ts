import { describe, expect, it } from "vitest";
import { loadTeams } from "../data/players.js";
import { realSerieARates, simulatedSeasonRates } from "./calibration.js";

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
