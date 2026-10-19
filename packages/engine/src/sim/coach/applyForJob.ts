import type { GameState } from "../gameState.js";
import { clubStatures } from "./clubStatures.js";
import { isCoolingDown, OFFER_REACH } from "./coach.js";
import { isHumanClub } from "./humanCoaches.js";
import { jobOffer } from "./offerJobs.js";
import { rivalBlockOf } from "../rivalries/idols.js";

/**
 * A club's answer to the coach's application: an offer on the table, or why not. `noOpening` when it has a
 * coach (or isn't a club he can coach), `tooBig` when his reputation falls short, `notWelcome` when he walked
 * out on it lately, `rivalIdol` when he is an idol of its big derby rival, `alreadyOffered` when its offer
 * is already on the table.
 */
export type JobAnswer = "offered" | "noOpening" | "tooBig" | "notWelcome" | "rivalIdol" | "alreadyOffered" | "retired";

// guess: a coach who asks for the job reaches a little further than the clubs that call him.
export const APPLY_REACH = OFFER_REACH + 5;

/** Why a club would turn down the coach in the seat. */
export type Refusal = Extract<JobAnswer, "tooBig" | "notWelcome" | "rivalIdol">;

/**
 * Why a club with an open job would turn down the coach in the seat: he walked out on it lately, he is an
 * idol of its big rival, or his reputation falls short of its stature; null when it would take him.
 */
export function refusalOf(state: GameState, clubId: string, stature: number): Refusal | null {
  if (isCoolingDown(state.coach, clubId, state.season)) return "notWelcome";
  if (rivalBlockOf(state, clubId)) return "rivalIdol";
  return stature <= state.coach.reputation + APPLY_REACH ? null : "tooBig";
}

/** The coach in the seat applies for a club's open job; the club answers at once. A retired coach applies nowhere. */
export function applyForJob(state: GameState, clubId: string): { state: GameState; answer: JobAnswer } {
  if (state.coach.retiredOn) return { state, answer: "retired" };
  const isOpen = clubId in (state.coaches?.openJobs ?? {}) && clubId in state.boards && !isHumanClub(state, clubId);
  if (!isOpen) return { state, answer: "noOpening" };
  if (isCoolingDown(state.coach, clubId, state.season)) return { state, answer: "notWelcome" };
  if (state.coach.offers.some((offer) => offer.clubId === clubId)) return { state, answer: "alreadyOffered" };
  const refusal = refusalOf(state, clubId, clubStatures(state).get(clubId) ?? 0);
  if (refusal) return { state, answer: refusal };
  return { state: { ...state, coach: { ...state.coach, offers: [...state.coach.offers, jobOffer(state, clubId)] } }, answer: "offered" };
}
