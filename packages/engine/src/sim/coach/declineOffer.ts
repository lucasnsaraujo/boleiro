import type { GameState } from "../gameState.js";

/** The player's coach turns an open offer down: it leaves the table at once, before it would expire. */
export function declineOffer(state: GameState, clubId: string): GameState {
  const offers = state.coach.offers.filter((offer) => offer.clubId !== clubId);
  if (offers.length === state.coach.offers.length) throw new Error(`no open offer from ${clubId}`);
  return { ...state, coach: { ...state.coach, offers } };
}
