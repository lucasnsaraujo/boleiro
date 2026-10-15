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
// guess: an auction runs four days, and never past the window.
export const AUCTION_DAYS = 4;

/**
 * Puts one of the coach's players up for sale `way`, or takes him off the market when `way` is null;
 * either way an offer or counter about him that was waiting goes with it. An auction needs the window open.
 */
export function listPlayer(state: GameState, playerId: string, way: SaleWay | null): GameState {
  const player = state.players[playerId];
  if (!player || player.clubId !== state.coachClubId || state.market.loans[playerId]) throw new Error(`${playerId} is not the coach's to sell`);
  const coach = withoutPlayer(coachMarketOf(state), playerId);
  if (way === null) return withCoachMarket(state, coach);
  const tier = tierOf(state.clubs[player.clubId] ?? { division: null });
  if (way !== "auction") {
    const price = askingPrice(player, tier, state.date, state.market.eurBrl, way);
    return withCoachMarket(state, { ...coach, listings: { ...coach.listings, [playerId]: { mode: way, price } } });
  }
  const closes = windowClosesOn(state.date);
  if (!closes) throw new Error("an auction needs the transfer window open");
  const last = addDays(state.date, AUCTION_DAYS);
  const auction = {
    minBid: Math.round(valuePlayer(player, tier, state.date) * state.market.eurBrl * AUCTION_FLOOR),
    closesOn: last < closes ? last : closes,
    bids: [],
  };
  return withCoachMarket(state, { ...coach, auctions: { ...coach.auctions, [playerId]: auction } });
}
