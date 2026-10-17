import type { GameState } from "../gameState.js";
import { clubStatures } from "./clubStatures.js";
import { isCoolingDown, OFFER_REACH } from "./coach.js";
import { isHumanClub } from "./humanCoaches.js";
import { jobOffer } from "./offerJobs.js";

/**
 * A club's answer to the coach's application: an offer on the table, or why not. `noOpening` when it has a
 * coach (or isn't a club he can coach), `tooBig` when his reputation falls short, `notWelcome` when he walked
 * out on it lately, `alreadyOffered` when its offer is already on the table.
 */
export type JobAnswer = "offered" | "noOpening" | "tooBig" | "notWelcome" | "alreadyOffered";

// guess: a coach who asks for the job reaches a little further than the clubs that call him.
export const APPLY_REACH = OFFER_REACH + 5;

/** Whether a club with an open job would take the coach in the seat: his reputation reaches its stature and it holds nothing against him. */
export function wouldHire(state: GameState, clubId: string, stature: number): boolean {
  return stature <= state.coach.reputation + APPLY_REACH && !isCoolingDown(state.coach, clubId, state.season);
}

/** The coach in the seat applies for a club's open job; the club answers at once. */
export function applyForJob(state: GameState, clubId: string): { state: GameState; answer: JobAnswer } {
  const isOpen = clubId in (state.coaches?.openJobs ?? {}) && clubId in state.boards && !isHumanClub(state, clubId);
  if (!isOpen) return { state, answer: "noOpening" };
  if (isCoolingDown(state.coach, clubId, state.season)) return { state, answer: "notWelcome" };
  if (state.coach.offers.some((offer) => offer.clubId === clubId)) return { state, answer: "alreadyOffered" };
  if (!wouldHire(state, clubId, clubStatures(state).get(clubId) ?? 0)) return { state, answer: "tooBig" };
  return { state: { ...state, coach: { ...state.coach, offers: [...state.coach.offers, jobOffer(state, clubId)] } }, answer: "offered" };
}
