import { addDays } from "../dates.js";
import type { GameState, IsoDate } from "../gameState.js";
import type { CoachMarket } from "./transferMarket.js";
import { windowClosesOn, type CoachWindows } from "./transferWindows.js";

const EMPTY: CoachMarket = { listings: {}, auctions: {}, bids: {}, counters: {} };
// guess: a club waits two days for an answer (the approved mock: an offer on Sunday, answer by Tuesday).
const DAYS_TO_ANSWER = 2;

/** The last day the coach can answer an offer made on `date`: two days on, and never past the window. */
export function answerBy(rules: CoachWindows, date: IsoDate): IsoDate {
  const last = addDays(date, DAYS_TO_ANSWER);
  const closes = windowClosesOn(rules, date);
  return closes && closes < last ? closes : last;
}

/** The coach's own business, empty when he never had any. */
export const coachMarketOf = (state: Pick<GameState, "market">): CoachMarket => state.market.coach ?? EMPTY;

export function withCoachMarket(state: GameState, coach: CoachMarket): GameState {
  return { ...state, market: { ...state.market, coach } };
}

function without<T>(record: Record<string, T>, id: string): Record<string, T> {
  if (!(id in record)) return record;
  const rest = { ...record };
  Reflect.deleteProperty(rest, id);
  return rest;
}

/** The coach's business with nothing left about this player: no listing, auction, offer or counter. */
export function withoutPlayer(coach: CoachMarket, playerId: string): CoachMarket {
  return {
    listings: without(coach.listings, playerId),
    auctions: without(coach.auctions, playerId),
    bids: without(coach.bids, playerId),
    counters: without(coach.counters, playerId),
  };
}

/** The coach turns down a selling club's counter to his offer; the rest of his business stays. */
export function declineCounter(state: GameState, playerId: string): GameState {
  const coach = coachMarketOf(state);
  if (!coach.counters[playerId]) throw new Error(`no counter-offer for ${playerId} waits for an answer`);
  return withCoachMarket(state, { ...coach, counters: without(coach.counters, playerId) });
}

/** A fixed 0–1 number hashed from `text` (FNV-1a), for draws a command makes without a random stream. */
export function unitHash(text: string): number {
  let hash = 2166136261;
  for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967296;
}
