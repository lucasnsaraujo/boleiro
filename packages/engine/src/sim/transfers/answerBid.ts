import type { GameState, SimPlayer } from "../gameState.js";
import { recordDayEvents } from "../history/recordDayEvents.js";
import { coachMarketOf, unitHash, withCoachMarket, withoutPlayer } from "./coachMarket.js";
import { contractEnd } from "./expireContracts.js";
import { marketView } from "./marketView.js";
import { movePlayer, openDraft } from "./movePlayer.js";
import { isSquadFull } from "./squadCap.js";
import type { PlayerMoved } from "./transferEvents.js";
import type { Bid } from "./transferMarket.js";
import { goingRate } from "./wageDemand.js";

/** The coach's answer to a club's offer: take it, turn it down, or ask for `fee` BRL. */
export type BidAnswer = { kind: "accept" } | { kind: "decline" } | { kind: "counter"; fee: number };
/** What came of it: he left, the offer was turned down, the buyer named its last price, or the buyer walked away. */
export type BidOutcome = "sold" | "declined" | "finalOffer" | "walkedAway";

/**
 * The monthly wage a club buying one of the coach's players pays him: its going rate for his strength.
 * A big club's player moving down takes the smaller club's pay, which he weighs when deciding to go.
 */
export const buyerWage = (player: Pick<SimPlayer, "strength">, squad: readonly SimPlayer[]): number => Math.max(1, goingRate(player.strength, squad));

/** Sells the player to the bidder for `fee`; null when the buyer can no longer register him. */
export function sellToBidder(state: GameState, bid: Bid, fee: number): { state: GameState; event: PlayerMoved } | null {
  const player = state.players[bid.playerId];
  if (!player) return null;
  const draft = openDraft(state);
  const view = marketView(state);
  if (bid.buyerId === null) return movePlayer(draft, { playerId: player.id, kind: "abroad", toClubId: null, fee }, view.squad);
  const squad = view.squad(bid.buyerId);
  if (isSquadFull(squad.length)) return null;
  // A command has no random stream; the contract's length is hashed from the player and the day instead.
  const until = contractEnd(Number(state.date.slice(0, 4)) + 1, () => unitHash(`${player.id}:${state.date}`));
  return movePlayer(draft, { playerId: player.id, kind: "transfer", toClubId: bid.buyerId, fee, contract: { wage: buyerWage(player, squad), until } }, view.squad);
}

/**
 * The coach answers an offer for one of his players. A counter-offer the buyer can reach sells him at
 * once; above that the buyer comes back with its highest price as a last word, or walks away when it
 * had already offered all it would. A last word can only be taken or turned down.
 */
export function answerBid(state: GameState, playerId: string, answer: BidAnswer): { state: GameState; outcome: BidOutcome; events: PlayerMoved[] } {
  const coach = coachMarketOf(state);
  const bid = coach.bids[playerId];
  if (!bid || bid.until < state.date) throw new Error(`no offer for ${playerId} waits for an answer`);
  const settled = (outcome: BidOutcome) => ({ state: withCoachMarket(state, withoutPlayer(coach, playerId)), outcome, events: [] });
  if (answer.kind === "decline") return settled("declined");
  if (answer.kind === "counter" && bid.isFinal) throw new Error("the buyer's last word can only be taken or turned down");
  const fee = answer.kind === "accept" ? bid.fee : Math.max(bid.fee, Math.round(answer.fee));
  if (fee > bid.ceiling) {
    if (bid.ceiling <= bid.fee) return settled("walkedAway");
    const last: Bid = { ...bid, fee: bid.ceiling, feeEur: bid.feeEur === null ? null : Math.round(bid.ceiling / state.market.eurBrl), isFinal: true };
    return { state: withCoachMarket(state, { ...coach, bids: { ...coach.bids, [playerId]: last } }), outcome: "finalOffer", events: [] };
  }
  const sold = sellToBidder(state, bid, fee);
  if (!sold) return settled("walkedAway");
  // A sale made outside a day goes into the history here, as a day's own sales do at its end.
  const recorded = recordDayEvents(sold.state, [sold.event], state);
  return { state: withCoachMarket(recorded, withoutPlayer(coachMarketOf(recorded), playerId)), outcome: "sold", events: [sold.event] };
}
