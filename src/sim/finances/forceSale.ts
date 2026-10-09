import { pickLineup } from "../../engine/match.js";
import type { GameState, Tier } from "../gameState.js";
import { sellPlayer } from "./sellPlayer.js";
import { projectedRevenue } from "./setBoardBudget.js";
import { tierOf } from "./tierOf.js";

export type ForcedSale = { type: "forcedSale"; clubId: string; playerId: string; buyerId: string | null; fee: number };

// guess: placeholder valuation until #11 — a fire sale fetches a year and a half of the player's wages.
const FEE_IN_YEARS_OF_WAGES = 1.5;
// guess: the board keeps at least 18 players so the coach can still name a matchday squad.
const MIN_SQUAD = 18;
const TIER_RANK: Record<Tier, number> = { A: 0, B: 1, C: 2, D: 3, state: 4 };

/**
 * The board sells the club's best-paid player outside the automatic best eleven to a richer club
 * that can pay, or abroad when none can. Returns null when the squad is too thin to sell.
 */
export function forceSale(state: GameState, clubId: string, random: () => number): { state: GameState; sale: ForcedSale } | null {
  const seller = state.clubs[clubId];
  const sellerFinance = state.finances[clubId];
  const squad = Object.values(state.players).filter((p) => p.clubId === clubId);
  if (!seller || !sellerFinance || squad.length <= MIN_SQUAD) return null;
  const key = new Set(pickLineup(squad));
  const player = squad.filter((p) => !key.has(p)).sort((a, b) => b.wage - a.wage || a.id.localeCompare(b.id))[0];
  if (!player) return null;
  const fee = Math.round(FEE_IN_YEARS_OF_WAGES * 12 * player.wage);
  const sellerRevenue = projectedRevenue(sellerFinance);
  const buyers = Object.values(state.clubs)
    .filter((club) => {
      const finance = state.finances[club.id];
      if (!finance || club.id === clubId || finance.cash < fee) return false;
      const gap = TIER_RANK[tierOf(club)] - TIER_RANK[tierOf(seller)];
      return gap < 0 || (gap === 0 && projectedRevenue(finance) > sellerRevenue);
    })
    .map((club) => club.id)
    .sort();
  const buyerId = buyers.length ? (buyers[Math.floor(random() * buyers.length)] ?? null) : null;
  return {
    state: sellPlayer(state, { playerId: player.id, buyerId, fee }),
    sale: { type: "forcedSale", clubId, playerId: player.id, buyerId, fee },
  };
}
