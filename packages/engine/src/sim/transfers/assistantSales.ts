import { doesAssistantHandle } from "../coach/assistantDuties.js";
import { tierOf } from "../finances/tierOf.js";
import type { GameState } from "../gameState.js";
import { squadsOfGame } from "../players/squadsByClub.js";
import { isWorthKeeping } from "./assistantRenewals.js";
import { coachMarketOf, withCoachMarket, withoutPlayer } from "./coachMarket.js";
import { sellToBidder } from "./answerBid.js";
import type { PlayerMoved } from "./transferEvents.js";

/**
 * If he runs the sales, the seated coach's assistant takes each standing offer for a player outside the
 * club's plans (assistantRenewals' isWorthKeeping: past the usual squad size by strength, or 34 and
 * over) at the fee offered. Offers for the players the club keeps wait for the coach.
 */
export function assistantSales(state: GameState): { state: GameState; events: PlayerMoved[] } {
  const clubId = state.coachClubId;
  const bids = Object.values(coachMarketOf(state).bids);
  if (!clubId || !bids.length || !doesAssistantHandle(state.coach, "selling")) return { state, events: [] };
  const tier = tierOf(state.clubs[clubId] ?? { division: null });
  let next = state;
  const events: PlayerMoved[] = [];
  for (const bid of bids.sort((a, b) => a.playerId.localeCompare(b.playerId))) {
    const squad = squadsOfGame(next).get(clubId) ?? [];
    const player = next.players[bid.playerId];
    if (!player || player.clubId !== clubId || bid.until < next.date || isWorthKeeping(player, squad, tier)) continue;
    const sold = sellToBidder(next, bid, bid.fee);
    if (!sold) continue;
    next = withCoachMarket(sold.state, withoutPlayer(coachMarketOf(sold.state), bid.playerId));
    events.push(sold.event);
  }
  return { state: next, events };
}
