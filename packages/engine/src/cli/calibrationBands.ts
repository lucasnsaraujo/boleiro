import type { Division } from "@boleiro/data/players";

/** One simulated number against its real one, the band that counts as agreeing, and the verdict. */
export type Comparison = { real: number; simulated: number; band: number; pass: boolean };

const TWO_STANDARD_ERRORS = 2;

function verdict(real: number, simulated: number, standardError: number, floor: number): Comparison {
  const band = Math.max(floor, TWO_STANDARD_ERRORS * standardError);
  return { real, simulated, band, pass: Math.abs(simulated - real) <= band };
}

/**
 * A share (home wins, draws, away wins) against the real one. The band is two standard errors of the
 * difference between two samples (`realGames` real, `simulatedGames` simulated), never narrower than `floor`,
 * the tolerance the engine's calibration tests allow.
 */
export function compareShare(real: number, simulated: number, realGames: number, simulatedGames: number, floor: number): Comparison {
  const standardError = Math.sqrt(real * (1 - real) * (1 / realGames + 1 / simulatedGames));
  return verdict(real, simulated, standardError, floor);
}

/** A per-match mean (goals, cards) against the real one, with `variance` of one match's value. */
export function compareMean(real: number, simulated: number, variance: number, realGames: number, simulatedGames: number, floor: number): Comparison {
  const standardError = Math.sqrt(variance * (1 / realGames + 1 / simulatedGames));
  return verdict(real, simulated, standardError, floor);
}

/** The tolerances of the engine's calibration tests (engine/calibration.test.ts), the narrowest band each division's numbers get. */
export const DIVISION_FLOORS: Record<Division, { share: number; goals: number }> = {
  A: { share: 0.02, goals: 0.1 },
  B: { share: 0.02, goals: 0.1 },
  C: { share: 0.025, goals: 0.1 },
  D: { share: 0.04, goals: 0.2 },
};
