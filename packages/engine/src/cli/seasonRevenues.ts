import { advanceDay } from "../sim/advanceDay.js";
import { totalRevenue } from "../sim/finances/ledger.js";
import { tierOf } from "../sim/finances/tierOf.js";
import type { GameState, Tier } from "../sim/gameState.js";
import { loadNewGame } from "../sim/loadNewGame.js";

export type ClubSeason = {
  season: number;
  clubId: string;
  tier: Tier;
  /** Revenue without player sales, in BRL. */
  revenue: number;
  playerSales: number;
  cash: number;
  loans: number;
  lateWageMonths: number;
};

/** Each club's books for the season that ended between `before` (its last day) and `after`. */
export function clubSeasonsOf(before: GameState, after: GameState): ClubSeason[] {
  return Object.entries(after.finances).flatMap(([clubId, finance]) => {
    const club = before.clubs[clubId];
    if (!club || !finance.lastSeason) return [];
    const playerSales = finance.lastSeason.revenue.playerSales;
    return [{
      season: before.season,
      clubId,
      tier: tierOf(club),
      revenue: totalRevenue(finance.lastSeason) - playerSales,
      playerSales,
      cash: finance.cash,
      loans: finance.loans,
      lateWageMonths: finance.lateWageMonths,
    }];
  });
}

/** Plays `seasons` whole seasons with no coach (in a game of `options`) and returns each club's books for every season. */
export function seasonRevenues(
  seed: number,
  seasons: number,
  options: Omit<Parameters<typeof loadNewGame>[1], "coachClubId"> = {},
): { clubSeasons: ClubSeason[]; forcedSales: number; lateWageClosings: number; state: GameState } {
  let state = loadNewGame(seed, { ...options, coachClubId: null });
  const clubSeasons: ClubSeason[] = [];
  let forcedSales = 0;
  let lateWageClosings = 0;
  const lastSeason = state.season + seasons - 1;
  while (state.season <= lastSeason) {
    const before = state;
    const day = advanceDay(state, {});
    state = day.state;
    forcedSales += day.events.filter((e) => e.type === "forcedSale").length;
    lateWageClosings += day.events.filter((e) => e.type === "wagesLate").length;
    if (day.events.some((e) => e.type === "seasonEnded")) clubSeasons.push(...clubSeasonsOf(before, state));
  }
  return { clubSeasons, forcedSales, lateWageClosings, state };
}
