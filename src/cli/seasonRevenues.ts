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

/** Plays `seasons` whole seasons with no coach and returns each club's books for every season. */
export function seasonRevenues(seed: number, seasons: number): { clubSeasons: ClubSeason[]; forcedSales: number; lateWageClosings: number; state: GameState } {
  let state = loadNewGame(seed, { coachClubId: null });
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
    if (!day.events.some((e) => e.type === "seasonEnded")) continue;
    for (const [clubId, finance] of Object.entries(state.finances)) {
      const club = before.clubs[clubId];
      if (!club || !finance.lastSeason) continue;
      const playerSales = finance.lastSeason.revenue.playerSales;
      clubSeasons.push({
        season: before.season,
        clubId,
        tier: tierOf(club),
        revenue: totalRevenue(finance.lastSeason) - playerSales,
        playerSales,
        cash: finance.cash,
        loans: finance.loans,
        lateWageMonths: finance.lateWageMonths,
      });
    }
  }
  return { clubSeasons, forcedSales, lateWageClosings, state };
}
