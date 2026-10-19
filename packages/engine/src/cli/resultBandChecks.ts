import { expect } from "vitest";
import { realDivisionRates } from "../engine/calibration.js";
import { compareMean, compareShare, DIVISION_FLOORS } from "./calibrationBands.js";
import type { SeasonStats } from "./seasonStats.js";

// Série A is left out: over ten seasons its squads thin out and its forwards fade, a drift of its own (docs/calibration-report.md).
const LOWER_DIVISIONS = ["B", "C", "D"] as const;

/**
 * Each lower division's home, draw and away shares and goals per game over the seasons of `stats`, within
 * the calibration report's band of the real league's. guess: goals per match spread like a Poisson
 * count, so their variance is their mean.
 */
export function expectLowerDivisionResultsNearReal(stats: readonly SeasonStats[]): void {
  for (const division of LOWER_DIVISIONS) {
    const real = realDivisionRates(division);
    const floor = DIVISION_FLOORS[division];
    const total = (field: "matches" | "home" | "draw" | "away" | "goals") => stats.reduce((sum, s) => sum + s.results[division][field], 0);
    const matches = total("matches");
    for (const result of ["home", "draw", "away"] as const) {
      const comparison = compareShare(real[result], total(result) / matches, real.matches, matches, floor.share);
      expect(Math.abs(comparison.simulated - comparison.real), `Série ${division} ${result}: ${comparison.simulated.toFixed(3)} against ${comparison.real.toFixed(3)}`).toBeLessThanOrEqual(comparison.band);
    }
    const goals = compareMean(real.goalsPerGame, total("goals") / matches, real.goalsPerGame, real.matches, matches, floor.goals);
    expect(Math.abs(goals.simulated - goals.real), `Série ${division} goals: ${goals.simulated.toFixed(2)} against ${goals.real.toFixed(2)}`).toBeLessThanOrEqual(goals.band);
  }
}
