import type { EngineParams } from "../../engine/match.js";
import type { ClubMood } from "./clubMood.js";

// Without fans, European home sides' goal edge fell from 0.29 to 0.15 a game (McCarrick et al.
// 2021, "Home advantage during the COVID-19 pandemic: Analyses of European football leagues",
// Psychology of Sport and Exercise 56:101969), so the crowd is about half of home advantage.
const CROWD_SHARE_OF_HOME_ADVANTAGE = 1 - 0.15 / 0.29;

/** Engine params for a home game: the crowd's share of home advantage goes when the doors are closed. */
export function withoutCrowd(params: EngineParams, homeMood: ClubMood): EngineParams {
  if (homeMood.closedDoorGames <= 0) return params;
  return { ...params, homeAdvantage: params.homeAdvantage * (1 - CROWD_SHARE_OF_HOME_ADVANTAGE) };
}
