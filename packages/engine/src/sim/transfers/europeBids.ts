import { addDays } from "../dates.js";
import type { GameState } from "../gameState.js";
import { answerBy, coachMarketOf, withCoachMarket } from "./coachMarket.js";
import { marketView } from "./marketView.js";
import { movePlayer } from "./movePlayer.js";
import type { BidReceived, EuropeBid, PlayerMoved } from "./transferEvents.js";
import { MIN_SQUAD } from "./tradeBetweenClubs.js";
import { valuePlayer } from "./valuePlayer.js";

// Europe is not simulated: it shows up as a buyer for young standouts. Brazil is the world's largest
// exporter of players (FIFA Global Transfer Report 2023), but most leave for small leagues; these
// constants aim at the few dozen a season who leave Série A and B for real money.
// guess: Europe looks at players up to 26 with strength 70 or more.
const MAX_AGE = 26;
const MIN_STRENGTH = 70;
// guess: chance of a bid over a whole window for a 72-strength 22-year-old, ×1.35 a strength point.
const BID_CHANCE_AT_72 = 0.15;
const PER_STRENGTH_POINT = 1.35;
const MAX_BID_CHANCE = 0.6;
// guess: each year under 22 makes a bid a tenth likelier; Europe buys potential.
const YOUTH_BONUS = { belowAge: 22, perYear: 0.1 };
// guess: AI clubs do business on about eight market days a window, so a day carries an eighth of the chance.
const MARKET_DAYS_PER_WINDOW = 8;
// guess: European bids land between market value and 60% above it.
const BID_PREMIUM = { min: 1, spread: 0.6 };
// guess: Europe does not buy a player in his first year at a Brazilian club.
const SETTLING_DAYS = 365;
// guess: Brazilian boards take nine European bids in ten at or above market value.
const ACCEPT_CHANCE = 0.9;

// guess: pushed by a counter-offer, a European club would go up to a quarter over its bid.
const COUNTER_ROOM = 0.25;

/**
 * One market day of European bids for Brazilian standouts. AI boards take or turn down theirs at once,
 * and accepted players leave the game; a bid for one of the coach's players waits for his answer.
 */
export function europeBids(state: GameState, random: () => number): { state: GameState; events: (EuropeBid | PlayerMoved | BidReceived)[] } {
  const events: (EuropeBid | PlayerMoved | BidReceived)[] = [];
  const view = marketView(state);
  const settledBefore = addDays(state.date, -SETTLING_DAYS);
  let next = state;
  let coach = coachMarketOf(state);
  const targets = Object.values(state.players)
    .filter((p) => p.age <= MAX_AGE && p.strength >= MIN_STRENGTH && !state.market.loans[p.id])
    .filter((p) => p.condition.arrivedOn === null || p.condition.arrivedOn < settledBefore)
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const player of targets) {
    const youth = 1 + YOUTH_BONUS.perYear * Math.max(0, YOUTH_BONUS.belowAge - player.age);
    const windowChance = Math.min(MAX_BID_CHANCE, BID_CHANCE_AT_72 * PER_STRENGTH_POINT ** (player.strength - 72) * youth);
    if (random() >= windowChance / MARKET_DAYS_PER_WINDOW) continue;
    const tier = view.tier(player.clubId);
    const value = valuePlayer(player, tier, state.date);
    const feeEur = Math.round(value * (BID_PREMIUM.min + BID_PREMIUM.spread * random()));
    const fee = Math.round(feeEur * state.market.eurBrl);
    if (player.clubId === state.coachClubId) {
      // Drawn in the place of an AI board's yes or no, so the AI clubs' business keeps its draws.
      const ceiling = Math.round(fee * (1 + COUNTER_ROOM * random()));
      if (coach.bids[player.id] || coach.auctions[player.id]) continue;
      const bid = { playerId: player.id, buyerId: null, fee, feeEur, ceiling, isFinal: false, madeOn: state.date, until: answerBy(state.date) };
      coach = { ...coach, bids: { ...coach.bids, [player.id]: bid } };
      events.push({ type: "bidReceived", playerId: player.id, buyerId: null, fee });
      continue;
    }
    const accepted = view.squad(player.clubId).length > MIN_SQUAD && random() < ACCEPT_CHANCE;
    events.push({ type: "europeBid", playerId: player.id, clubId: player.clubId, feeEur, fee, accepted });
    if (!accepted) continue;
    const moved = movePlayer(next, { playerId: player.id, kind: "abroad", toClubId: null, fee }, view.squad);
    next = moved.state;
    view.record(player, null);
    events.push(moved.event);
  }
  return { state: coach === coachMarketOf(next) ? next : withCoachMarket(next, coach), events };
}
