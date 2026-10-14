import type { GameState } from "../sim/gameState.js";
import { loadNewGame } from "../sim/loadNewGame.js";
import { playSeason } from "./playSeason.js";
import { strengthBands, type StrengthBand } from "./strengthBySeason.js";
import { seasonStats, type SeasonStats } from "./seasonStats.js";
import { summarizeSeason, type SeasonSummary } from "./summarizeSeason.js";

export type SeasonRun = {
  seasons: { summary: SeasonSummary; stats: SeasonStats }[];
  /** Each tier's strength band at the start and after every season. */
  strength: StrengthBand[];
  final: GameState;
};

/**
 * Plays `seasons` whole seasons with no coach. `betweenSeasons` gets the state at each new season's
 * start and returns the state to play on with, so a test can save and load it there.
 */
export function runSeasons(seed: number, seasons: number, betweenSeasons: (state: GameState) => GameState = (state) => state): SeasonRun {
  let state = loadNewGame(seed, { coachClubId: null });
  const played: SeasonRun["seasons"] = [];
  const strength = strengthBands(state);
  for (let i = 0; i < seasons; i++) {
    const season = playSeason(state);
    played.push({ summary: summarizeSeason(season), stats: seasonStats(season) });
    strength.push(...strengthBands(season.after));
    state = betweenSeasons(season.after);
  }
  return { seasons: played, strength, final: state };
}
