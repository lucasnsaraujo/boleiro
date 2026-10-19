import { expect } from "vitest";
import type { Division } from "@boleiro/data/players";
import { realDivisionRates, realSerieARates } from "../engine/calibration.js";
import { compareMean, compareShare, DIVISION_FLOORS } from "./calibrationBands.js";
import type { SeasonStats } from "./seasonStats.js";

const DIVISIONS: readonly Division[] = ["A", "B", "C", "D"];

/**
 * Each division's home, draw and away shares and goals per game over the seasons of `stats`, within
 * the calibration report's band of the real league's. guess: goals per match spread like a Poisson
 * count, so their variance is their mean.
 */
export function expectResultsNearReal(stats: readonly SeasonStats[]): void {
  for (const division of DIVISIONS) {
    const real = division === "A" ? realSerieARates() : realDivisionRates(division);
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
