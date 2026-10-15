import { pickLineup } from "../../engine/match.js";
import type { GameState, Tier } from "../gameState.js";
import type { MarketView } from "../transfers/marketView.js";
import { movePlayer } from "../transfers/movePlayer.js";
import { valuePlayer } from "../transfers/valuePlayer.js";
import { projectedRevenue } from "./setBoardBudget.js";
import { tierOf } from "./tierOf.js";
import { isHumanClub } from "../coach/humanCoaches.js";

export type ForcedSale = { type: "forcedSale"; clubId: string; playerId: string; buyerId: string | null; fee: number };

// guess: a fire sale fetches three quarters of the player's market value.
const FIRE_SALE_SHARE_OF_VALUE = 0.75;
// guess: the board keeps at least 18 players so the coach can still name a matchday squad.
const MIN_SQUAD = 18;
const TIER_RANK: Record<Tier, number> = { A: 0, B: 1, C: 2, D: 3, state: 4 };

/**
 * The board sells the club's best-paid player it owns outside the automatic best eleven to a richer
 * AI club that can pay, or abroad when none can. Returns null when the squad is too thin to sell.
 * `state` must be a draft (openDraft) and `view` built from it; the sale is recorded in both.
 */
export function forceSale(state: GameState, clubId: string, random: () => number, view: MarketView): { state: GameState; sale: ForcedSale } | null {
  const seller = state.clubs[clubId];
  const sellerFinance = state.finances[clubId];
  const squad = view.squad(clubId);
  if (!seller || !sellerFinance || squad.length <= MIN_SQUAD) return null;
  const key = new Set(pickLineup(squad));
  // Players on loan here belong to another club, so the board can't sell them.
  const owned = squad.filter((p) => !key.has(p) && !state.market.loans[p.id]);
  const player = owned.sort((a, b) => b.wage - a.wage || a.id.localeCompare(b.id))[0];
  if (!player) return null;
  const fee = Math.round(FIRE_SALE_SHARE_OF_VALUE * valuePlayer(player, tierOf(seller), state.date) * state.market.eurBrl);
  const sellerRevenue = projectedRevenue(sellerFinance);
  const buyers = Object.values(state.clubs)
    .filter((club) => {
      const finance = state.finances[club.id];
      if (!finance || club.id === clubId || isHumanClub(state, club.id) || finance.cash < fee) return false;
      const gap = TIER_RANK[tierOf(club)] - TIER_RANK[tierOf(seller)];
      return gap < 0 || (gap === 0 && projectedRevenue(finance) > sellerRevenue);
    })
    .map((club) => club.id)
    .sort();
  const buyerId = buyers.length ? (buyers[Math.floor(random() * buyers.length)] ?? null) : null;
  const moved = movePlayer(state, { playerId: player.id, kind: buyerId ? "transfer" : "abroad", toClubId: buyerId, fee }, view.squad);
  view.record(player, moved.state.players[player.id] ?? null);
  return { state: moved.state, sale: { type: "forcedSale", clubId, playerId: player.id, buyerId, fee } };
}
