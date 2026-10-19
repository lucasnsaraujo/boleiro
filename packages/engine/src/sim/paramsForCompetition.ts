import { CALIBRATED, type EngineParams } from "../engine/match.js";
import { CUP_PARAMS, paramsForDivision } from "../engine/paramsForDivision.js";
import { paramsForLeagueAbroad } from "../engine/paramsForLeagueAbroad.js";
import { isOnNeutralGround } from "./continental/neutralGrounds.js";
import type { Competition } from "./gameState.js";

/**
 * League games use their division's params and Copa do Brasil games `CUP_PARAMS`; a league abroad
 * plays at its own (paramsForLeagueAbroad), as its result-only games do.
 * guess: state championships also use `CUP_PARAMS`: like the cup they pit clubs of different
 * divisions against each other, and big clubs rest players in them; no estadual data was fitted.
 * A stage on neutral grounds gives neither club a home advantage.
 */
export function paramsForCompetition(competition: Competition, stage: number): EngineParams {
  if (isOnNeutralGround(competition, stage)) return { ...CUP_PARAMS, homeAdvantage: 0 };
  if (competition.kind !== "league") return CUP_PARAMS;
  if (competition.division) return paramsForDivision(competition.division);
  return competition.abroad ? paramsForLeagueAbroad(competition.abroad.country, competition.abroad.level) : CALIBRATED;
}
