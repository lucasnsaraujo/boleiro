import type { Division } from "@boleiro/data/players";
import { CALIBRATED, type EngineParams } from "./match.js";

/**
 * Fitted by `pnpm calibrate`. Série B–D fit baseGoals, homeAdvantage and lowScoreCorrelation
 * to their own results in data/history (FIRST_CURRENT_SEASON on; Série D has only 2024).
 * They keep Série A's strengthImpact and gapSaturation: B–D have no betting odds that would
 * show how far apart their teams are.
 */
export const DIVISION_PARAMS: Record<Division, EngineParams> = {
  A: CALIBRATED,
  B: { ...CALIBRATED, baseGoals: 0.7922, homeAdvantage: 0.4757, lowScoreCorrelation: -0.041 },
  C: { ...CALIBRATED, baseGoals: 0.8351, homeAdvantage: 0.4833, lowScoreCorrelation: -0.112 },
  D: { ...CALIBRATED, baseGoals: 0.8752, homeAdvantage: 0.4094, lowScoreCorrelation: -0.1323 },
};

/**
 * Every Copa do Brasil match, fitted by `pnpm calibrate` to cross-division cup matches
 * 2017–2025 (cupUpsets.ts). Cup favourites win far less than the division baselines in
 * pipeline/rate_players.py predict with Série A's strengthImpact (Série A away at Série D or
 * below: 61% real, 89% before this fit), so the cup has its own, flatter strengthImpact rather
 * than squashed baselines: big clubs rest players in the cup, early rounds let the away
 * favourite go through on a draw, and the small clubs that reach later rounds are the best of
 * their division. Home advantage is larger than in any league.
 */
export const CUP_PARAMS: EngineParams = {
  ...CALIBRATED,
  baseGoals: 0.8248,
  homeAdvantage: 0.5255,
  strengthImpact: 0.0329,
  gapSaturation: 35.2161,
};

export function paramsForDivision(division: Division): EngineParams {
  return DIVISION_PARAMS[division];
}
