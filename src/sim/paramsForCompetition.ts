import type { EngineParams } from "../engine/match.js";
import { CUP_PARAMS, paramsForDivision } from "../engine/paramsForDivision.js";
import type { Competition } from "./gameState.js";

/**
 * League games use their division's params and Copa do Brasil games `CUP_PARAMS`.
 * guess: state championships also use `CUP_PARAMS`: like the cup they pit clubs of different
 * divisions against each other, and big clubs rest players in them; no estadual data was fitted.
 */
export function paramsForCompetition(competition: Competition): EngineParams {
  return competition.kind === "league" ? paramsForDivision(competition.division) : CUP_PARAMS;
}
