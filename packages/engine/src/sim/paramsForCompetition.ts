import { CALIBRATED, type EngineParams } from "../engine/match.js";
import { CUP_PARAMS, paramsForDivision } from "../engine/paramsForDivision.js";
import { isOnNeutralGround } from "./continental/neutralGrounds.js";
import type { Competition } from "./gameState.js";

/**
 * League games use their division's params and Copa do Brasil games `CUP_PARAMS`. guess: a league
 * abroad plays at the Série A calibration its result-only games used.
 * guess: state championships also use `CUP_PARAMS`: like the cup they pit clubs of different
 * divisions against each other, and big clubs rest players in them; no estadual data was fitted.
 * A stage on neutral grounds gives neither club a home advantage.
 */
export function paramsForCompetition(competition: Competition, stage: number): EngineParams {
  if (isOnNeutralGround(competition, stage)) return { ...CUP_PARAMS, homeAdvantage: 0 };
  if (competition.kind !== "league") return CUP_PARAMS;
  return competition.division ? paramsForDivision(competition.division) : CALIBRATED;
}
