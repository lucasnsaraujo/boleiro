import { tierOf } from "../finances/tierOf.js";
import { addDays } from "../dates.js";
import type { GameState } from "../gameState.js";
import { askingPrice } from "./askingPrice.js";
import { coachMarketOf, withCoachMarket, withoutPlayer } from "./coachMarket.js";
import type { ListingMode } from "./transferMarket.js";
import { windowClosesOn } from "./transferWindows.js";
import { valuePlayer } from "./valuePlayer.js";

/** How the coach offers a player: at a price in one of the modes, or at auction. */
export type SaleWay = ListingMode | "auction";

// guess: the lowest bid an auction takes is 70% of market value (Brasfoot's floor is 50%,
// club-market-match.md §2.5, on values that run higher than Boleiro's).
export const AUCTION_FLOOR = 0.7;
// guess: an auction takes bids for four days, and the sale lands inside the window.
export const AUCTION_DAYS = 4;

/**
 * Puts one of the coach's players up for sale `way`, or takes him off the market when `way` is null.
 * A club's offer for him that was waiting stays, unless he goes to auction, where the bids take its
 * place. An auction needs the window open a few more days.
 */
export function listPlayer(state: GameState, playerId: string, way: SaleWay | null): GameState {
  const player = state.players[playerId];
  if (!player || player.clubId !== state.coachClubId || state.market.loans[playerId]) throw new Error(`${playerId} is not the coach's to sell`);
  const before = coachMarketOf(state);
  const cleared = withoutPlayer(before, playerId);
  const coach = way === "auction" ? cleared : { ...cleared, bids: before.bids };
  if (way === null) return withCoachMarket(state, coach);
  const tier = tierOf(state.clubs[player.clubId] ?? { division: null });
  if (way !== "auction") {
    const price = askingPrice(player, tier, state.date, state.market.eurBrl, way);
    return withCoachMarket(state, { ...coach, listings: { ...coach.listings, [playerId]: { mode: way, price } } });
  }
  // Clubs bid from tomorrow, and the best bid takes him the morning after the last day of bids, which
  // must still be inside the window.
  const closes = windowClosesOn(state, state.date);
  const lastInWindow = closes && addDays(closes, -1);
  if (!lastInWindow || lastInWindow <= state.date) throw new Error("an auction needs the transfer window open a few more days");
  const fourDays = addDays(state.date, AUCTION_DAYS);
  const auction = {
    minBid: Math.round(valuePlayer(player, tier, state.date) * state.market.eurBrl * AUCTION_FLOOR),
    closesOn: fourDays < lastInWindow ? fourDays : lastInWindow,
    bids: [],
  };
  return withCoachMarket(state, { ...coach, auctions: { ...coach.auctions, [playerId]: auction } });
}
