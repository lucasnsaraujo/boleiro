import type { GameState, SimPlayer } from "../gameState.js";
import { buyerWage, sellToBidder } from "./answerBid.js";
import { boardRefusal } from "./boardRefusal.js";
import { answerBy, coachMarketOf, unitHash, withCoachMarket, withoutPlayer } from "./coachMarket.js";
import { marketView, type MarketView } from "./marketView.js";
import { isSquadFull } from "./squadCap.js";
import { REPLACEMENT_BAND, squadNeeds } from "./squadNeeds.js";
import type { AuctionClosed, BidReceived, PlayerMoved } from "./transferEvents.js";
import type { Bid, CoachMarket, ListingMode } from "./transferMarket.js";
import { isMarketDay, isWindowOpen } from "./transferWindows.js";
import { valuePlayer } from "./valuePlayer.js";
import { willingToJoin } from "./willingToJoin.js";

type CoachMarketEvent = BidReceived | AuctionClosed | PlayerMoved;

// guess: a cheap listing finds a buyer in about four window days, an expensive one in about four weeks.
export const LISTING_DAILY_CHANCE: Record<ListingMode, number> = { cheap: 0.25, expensive: 0.04 };
// guess: a buyer for a listed player would go up to a tenth over the asking price if pushed.
const LISTING_CEILING_SPREAD = 0.1;
// guess: on a market day each of the coach's players draws an unasked offer one time in fifty, about
// ten offers a season for a 30-man squad (Brasfoot: 1% each time the team screen opens, §2.6).
const UNASKED_BID_CHANCE = 0.02;
// guess: an unasked offer opens between 80% and 120% of market value; the buyer would go 5% to 35% higher.
const UNASKED_FEE = { min: 0.8, spread: 0.4 };
const UNASKED_CEILING = { min: 1.05, spread: 0.3 };
// guess: in an auction up to three interested clubs look each day, each bidding one time in three,
// 3% to 10% over the best bid, up to its own limit of 90% to 160% of market value.
const AUCTION_LOOKERS = 3;
const AUCTION_BID_CHANCE = 1 / 3;
const AUCTION_RAISE = { min: 0.03, spread: 0.07 };
const AUCTION_LIMIT = { min: 0.9, spread: 0.7 };
// guess: a club pays the fee up front plus three months of the new wage, as the AI's own deals budget it.
const WAGE_MONTHS_UP_FRONT = 3;

/** Whether a club would buy `player` for `fee` today: room in the squad, he would play, and its board can pay. */
function canBuy(state: GameState, view: MarketView, player: SimPlayer, clubId: string, fee: number): boolean {
  const finance = state.finances[clubId];
  const squad = view.squad(clubId);
  if (clubId === state.coachClubId || !finance || squad.length < 11 || isSquadFull(squad.length)) return false;
  if (player.strength < squadNeeds(squad, view.tier(clubId)).level - REPLACEMENT_BAND.below) return false;
  const wage = buyerWage(player, squad);
  // guess: like the AI's own upgrades, the buyer counts on moving on its cheapest player at his
  // position, so only the difference weighs on its wage cap (most boards sit right at theirs).
  const outgoing = squad.reduce((low, p) => (p.group === player.group && p.wage < low ? p.wage : low), wage);
  return !boardRefusal(finance, view.bill(clubId), { upFront: fee + WAGE_MONTHS_UP_FRONT * wage, wageChange: wage - outgoing });
}

/** The clubs that would buy `player` for `fee` today. */
function interestedBuyers(state: GameState, view: MarketView, player: SimPlayer, fee: number): string[] {
  return Object.keys(state.finances)
    .sort()
    .filter((clubId) => canBuy(state, view, player, clubId, fee));
}

/**
 * One buyer among the interested, or null. A player the coach put up for sale knows he is not wanted
 * and goes (as in Brasfoot, §2.3); one a club approaches unasked must want the move.
 */
function pickBuyer(state: GameState, view: MarketView, player: SimPlayer, fee: number, random: () => number, isListed: boolean): string | null {
  const buyers = interestedBuyers(state, view, player, fee);
  const buyerId = buyers[Math.floor(random() * buyers.length)];
  const club = buyerId ? state.clubs[buyerId] : undefined;
  if (!buyerId || !club) return null;
  if (isListed) return buyerId;
  const wage = buyerWage(player, view.squad(buyerId));
  const to = { tier: view.tier(buyerId), fanbase: club.fanbase };
  return random() < willingToJoin({ player, from: view.tier(player.clubId), to, wage }) ? buyerId : null;
}

/** Drops what no longer stands: business about players who left the coach, lapsed offers and counters. */
function prune(state: GameState, coach: CoachMarket): CoachMarket {
  let kept = coach;
  const isOurs = (playerId: string) => state.players[playerId]?.clubId === state.coachClubId;
  for (const id of [...Object.keys(coach.listings), ...Object.keys(coach.auctions), ...Object.keys(coach.bids)]) {
    if (!isOurs(id)) kept = withoutPlayer(kept, id);
  }
  for (const [id, bid] of Object.entries(kept.bids)) if (bid.until < state.date) kept = withoutPlayer(kept, id);
  for (const [id, counter] of Object.entries(kept.counters)) {
    if (counter.until < state.date || state.players[id]?.clubId !== counter.clubId) kept = withoutPlayer(kept, id);
  }
  return kept;
}

/**
 * The coach's market day, at the start of `state.date`: what lapsed goes, auctions that ended sell to
 * their best bid, and inside the window clubs bid in his auctions, buyers come for his listed players at
 * the asking price and, on market days, clubs make offers for others. Every offer waits for his answer.
 */
export function coachMarketDay(state: GameState, random: () => number): { state: GameState; events: CoachMarketEvent[] } {
  const before = state.market.coach;
  if (!before && !state.coachClubId) return { state, events: [] };
  const events: CoachMarketEvent[] = [];
  let next = before ? withCoachMarket(state, prune(state, before)) : state;

  for (const [playerId, auction] of Object.entries(coachMarketOf(next).auctions).sort(([a], [b]) => a.localeCompare(b))) {
    if (auction.closesOn >= state.date) continue;
    const ranked = [...auction.bids].sort((a, b) => b.fee - a.fee || a.date.localeCompare(b.date));
    let sold = false;
    for (const best of ranked) {
      const bid: Bid = { playerId, buyerId: best.clubId, fee: best.fee, feeEur: null, ceiling: best.fee, isFinal: true, madeOn: best.date, until: state.date };
      const moved = sellToBidder(next, bid, best.fee);
      if (!moved) continue;
      next = moved.state;
      events.push(moved.event);
      sold = true;
      break;
    }
    next = withCoachMarket(next, withoutPlayer(coachMarketOf(next), playerId));
    events.push({ type: "auctionClosed", playerId, sold });
  }

  const pending = coachMarketOf(next);
  const hasBusiness = Object.keys(pending.auctions).length > 0 || Object.keys(pending.listings).length > 0 || isMarketDay(state.date);
  if (!isWindowOpen(state.date) || !next.coachClubId || !hasBusiness) return { state: next, events };
  const view = marketView(next);
  const tier = view.tier(next.coachClubId);
  const valueOf = (player: SimPlayer) => valuePlayer(player, tier, state.date) * next.market.eurBrl;
  let coach = coachMarketOf(next);

  for (const [playerId, auction] of Object.entries(coach.auctions).sort(([a], [b]) => a.localeCompare(b))) {
    const player = next.players[playerId];
    if (!player) continue;
    const bids = [...auction.bids];
    const looking = interestedBuyers(next, view, player, auction.minBid);
    for (let look = 0; look < AUCTION_LOOKERS && looking.length; look++) {
      const clubId = looking.splice(Math.floor(random() * looking.length), 1)[0];
      if (!clubId || random() >= AUCTION_BID_CHANCE) continue;
      const top = bids.reduce((best, b) => (b.fee > best.fee ? b : best), { clubId: "", fee: 0, date: state.date });
      if (top.clubId === clubId) continue;
      const fee = Math.max(auction.minBid, Math.round(top.fee * (1 + AUCTION_RAISE.min + AUCTION_RAISE.spread * random())));
      const limit = valueOf(player) * (AUCTION_LIMIT.min + AUCTION_LIMIT.spread * unitHash(`${clubId}:${playerId}`));
      if (fee <= limit && canBuy(next, view, player, clubId, fee)) bids.push({ clubId, fee, date: state.date });
    }
    if (bids.length > auction.bids.length) coach = { ...coach, auctions: { ...coach.auctions, [playerId]: { ...auction, bids } } };
  }

  const offer = (bid: Bid) => {
    coach = { ...coach, bids: { ...coach.bids, [bid.playerId]: bid } };
    events.push({ type: "bidReceived", playerId: bid.playerId, buyerId: bid.buyerId, fee: bid.fee });
  };
  const until = answerBy(state.date);
  for (const [playerId, listing] of Object.entries(coach.listings).sort(([a], [b]) => a.localeCompare(b))) {
    const player = next.players[playerId];
    if (!player || coach.bids[playerId] || random() >= LISTING_DAILY_CHANCE[listing.mode]) continue;
    // A buyer must be able to pay all it would go to if pushed.
    const ceiling = Math.round(listing.price * (1 + LISTING_CEILING_SPREAD * random()));
    const buyerId = pickBuyer(next, view, player, ceiling, random, true);
    if (!buyerId) continue;
    offer({ playerId, buyerId, fee: listing.price, feeEur: null, ceiling, isFinal: false, madeOn: state.date, until });
  }

  if (isMarketDay(state.date)) {
    const squad = view.squad(next.coachClubId).filter((p) => !coach.listings[p.id] && !coach.auctions[p.id] && !coach.bids[p.id] && !next.market.loans[p.id]);
    for (const player of squad.sort((a, b) => a.id.localeCompare(b.id))) {
      if (random() >= UNASKED_BID_CHANCE) continue;
      const fee = Math.round(valueOf(player) * (UNASKED_FEE.min + UNASKED_FEE.spread * random()));
      const ceiling = Math.round(fee * (UNASKED_CEILING.min + UNASKED_CEILING.spread * random()));
      const buyerId = pickBuyer(next, view, player, ceiling, random, false);
      if (!buyerId) continue;
      offer({ playerId: player.id, buyerId, fee, feeEur: null, ceiling, isFinal: false, madeOn: state.date, until });
    }
  }
  return { state: coach === coachMarketOf(next) ? next : withCoachMarket(next, coach), events };
}
