import { chemistryOf } from "../chemistry/chemistryOf.js";
import { assistantOf, assistantReadOf } from "../coach/assistant.js";
import { doesAssistantHandle } from "../coach/assistantDuties.js";
import { assistantEleven } from "../coach/assistantTips.js";
import { tierOf } from "../finances/tierOf.js";
import type { GameState } from "../gameState.js";
import { squadsOfGame } from "../players/squadsByClub.js";
import { isWorthKeeping } from "./assistantRenewals.js";
import { coachMarketOf, withCoachMarket, withoutPlayer } from "./coachMarket.js";
import { sellToBidder } from "./answerBid.js";
import type { PlayerMoved } from "./transferEvents.js";

/** The players the seated coach's assistant never sells: his own eleven, the club's usual starters and the captain. */
function keyPlayersOf(state: GameState, clubId: string): ReadonlySet<string> {
  const chemistry = chemistryOf(state, clubId);
  const eleven = assistantEleven(state, clubId, state.coach.tactics.formation, assistantReadOf(state, assistantOf(state)));
  return new Set([...eleven.map((p) => p.playerId), ...chemistry.eleven, ...(chemistry.captain ? [chemistry.captain.playerId] : [])]);
}

/**
 * If he runs the sales, the seated coach's assistant sells each player with a standing offer who is
 * outside the club's plans (assistantRenewals' isWorthKeeping: past the usual squad size by strength,
 * or 34 and over) and not one of its key players. He counters at the most the buyer would pay, which
 * answerBid sells for at once. Offers for the players the club keeps wait for the coach.
 */
export function assistantSales(state: GameState): { state: GameState; events: PlayerMoved[] } {
  const clubId = state.coachClubId;
  const bids = Object.values(coachMarketOf(state).bids);
  if (!clubId || !bids.length || !doesAssistantHandle(state.coach, "selling")) return { state, events: [] };
  const tier = tierOf(state.clubs[clubId] ?? { division: null });
  const keyPlayers = keyPlayersOf(state, clubId);
  let next = state;
  const events: PlayerMoved[] = [];
  for (const bid of bids.sort((a, b) => a.playerId.localeCompare(b.playerId))) {
    const squad = squadsOfGame(next).get(clubId) ?? [];
    const player = next.players[bid.playerId];
    if (!player || player.clubId !== clubId || bid.until < next.date || keyPlayers.has(player.id) || isWorthKeeping(player, squad, tier)) continue;
    const sold = sellToBidder(next, bid, Math.max(bid.fee, bid.ceiling));
    if (!sold) continue;
    next = withCoachMarket(sold.state, withoutPlayer(coachMarketOf(sold.state), bid.playerId));
    events.push({ ...sold.event, byAssistant: true });
  }
  return { state: next, events };
}
