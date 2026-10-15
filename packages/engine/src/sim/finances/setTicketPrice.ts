import type { ClubFinance, GameState } from "../gameState.js";
import { tierOf } from "./tierOf.js";

// guess: the price box runs from a quarter of the division's average ticket to five times it; past
// that nobody comes (see priceDemand) and below it the club gives the seats away.
export const TICKET_PRICE_RANGE = { min: 0.25, max: 5 };

/** The assistant's ticket price for a club: its division's average, the price every club opens with. */
export function assistantTicketPrice(state: Pick<GameState, "clubs" | "economy">, clubId: string): number {
  const club = state.clubs[clubId];
  if (!club) throw new Error(`no club ${clubId}`);
  return state.economy.matchday[tierOf(club)].price;
}

/** The lowest and highest whole-real price the coach can set for his club's home games. */
export function ticketPriceBounds(state: Pick<GameState, "clubs" | "economy">, clubId: string): { min: number; max: number } {
  const average = assistantTicketPrice(state, clubId);
  return { min: Math.max(1, Math.ceil(TICKET_PRICE_RANGE.min * average)), max: Math.floor(TICKET_PRICE_RANGE.max * average) };
}

/** A club the coach has left goes back to the assistant's price and stops keeping its gates for him. */
export function releaseTicketPrice(state: GameState, formerClubId: string | null): GameState {
  const finance = formerClubId ? state.finances[formerClubId] : undefined;
  if (!formerClubId || !finance || formerClubId === state.coachClubId) return state;
  const price = assistantTicketPrice(state, formerClubId);
  if (finance.ticketPrice === price && !finance.homeGates) return state;
  const released: ClubFinance = { ...finance, ticketPrice: price };
  delete released.homeGates;
  return { ...state, finances: { ...state.finances, [formerClubId]: released } };
}

/** The coach sets the price of a ticket for his club's home games from the next one on. */
export function setTicketPrice(state: GameState, price: number): GameState {
  const clubId = state.coachClubId;
  const finance = clubId ? state.finances[clubId] : undefined;
  if (!clubId || !finance) throw new Error("the coach has no club to price tickets for");
  const { min, max } = ticketPriceBounds(state, clubId);
  if (!Number.isInteger(price) || price < min || price > max) throw new Error(`a ticket costs from R$ ${min} to R$ ${max} in whole reais`);
  return { ...state, finances: { ...state.finances, [clubId]: { ...finance, ticketPrice: price } } };
}
