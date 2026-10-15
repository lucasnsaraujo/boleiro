import { describe, expect, it } from "vitest";
import { realDivisionRates, realSerieARates, simulatedSeasonRates } from "../../engine/calibration.js";
import { paramsForDivision } from "../../engine/paramsForDivision.js";
import { loadNewGame } from "../loadNewGame.js";
import { fieldedTeams } from "./fieldedTeams.js";

const game = loadNewGame(1, { coachClubId: null });

// The same bands as calibration.test.ts, for the elevens the game actually fields: by position, in
// each club's formation, paying for anyone out of position.
const TOLERANCE = { A: { share: 0.02, goals: 0.1 }, B: { share: 0.02, goals: 0.1 }, C: { share: 0.025, goals: 0.1 }, D: { share: 0.04, goals: 0.2 } } as const;

describe.each(["A", "B", "C", "D"] as const)("Série %s fielded by position", (division) => {
  const real = division === "A" ? realSerieARates() : realDivisionRates(division);
  const simulated = simulatedSeasonRates(fieldedTeams(game, division), paramsForDivision(division));
  const tolerance = TOLERANCE[division];

  it("stays within the calibration bands for home, draw and away", () => {
    expect(Math.abs(simulated.home - real.home)).toBeLessThan(tolerance.share);
    expect(Math.abs(simulated.draw - real.draw)).toBeLessThan(tolerance.share);
    expect(Math.abs(simulated.away - real.away)).toBeLessThan(tolerance.share);
  });

  it("scores as many goals per game as the real league", () => {
    expect(Math.abs(simulated.goalsPerGame - real.goalsPerGame)).toBeLessThan(tolerance.goals);
  });
});
