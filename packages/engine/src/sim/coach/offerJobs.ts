import { addDays } from "../dates.js";
import type { GameState } from "../gameState.js";
import { clubStatures } from "./clubStatures.js";
import { isCoolingDown, OFFER_REACH, type JobOffer } from "./coach.js";
import { coachSalary } from "./coachSalary.js";
import { isHumanClub } from "./humanCoaches.js";
import { rivalBlockOf } from "../rivalries/idols.js";

export type JobOffered = { type: "jobOffered"; offer: JobOffer };

// guess: a club waits two weeks for an answer before it hires someone else.
export const OFFER_DAYS = 14;
// guess: an employed coach only hears from clubs clearly bigger than his own.
const STEP_UP = 10;
// guess: an unemployed coach with no offer on the table hears from some club about once a month.
const IDLE_OFFER_CHANCE_PER_DAY = 1 / 30;
// guess: contracts signed in the second half of the year run to the end of the next season.
const SECOND_HALF_FROM_MONTH = 7;

/** The offer a club makes the coach today: its salary, a contract to the season's end (the next one's from July) and two weeks to answer. */
export function jobOffer(state: GameState, clubId: string): JobOffer {
  const month = Number(state.date.slice(5, 7));
  return {
    clubId,
    salary: coachSalary(state, clubId),
    untilSeason: month >= SECOND_HALF_FROM_MONTH ? state.season + 1 : state.season,
    expiresOn: addDays(state.date, OFFER_DAYS),
  };
}

/**
 * Drops expired offers, then offers the player's coach the clubs' open jobs that his reputation
 * reaches, but for the big derby rivals of a club he is an idol of. Clubs with an open job go to `vacancies`; an unemployed coach also hears from a club now and then.
 * A retired coach hears from nobody.
 */
export function offerJobs(state: GameState, vacancies: readonly string[], random: () => number): { state: GameState; events: JobOffered[] } {
  const { coach, coachClubId } = state;
  if (coach.retiredOn) return { state, events: [] };
  // A club another hot-seat coach has taken is no longer hiring.
  let offers = coach.offers.filter((offer) => offer.expiresOn >= state.date && (offer.clubId === coachClubId || !isHumanClub(state, offer.clubId)));
  // Ranked only when a job is open or an idle coach hears from a club: most days need neither.
  let ranked: { statures: Map<string, number>; floor: number } | null = null;
  const rank = () => {
    if (ranked) return ranked;
    const statures = clubStatures(state);
    ranked = { statures, floor: coachClubId ? (statures.get(coachClubId) ?? 0) + STEP_UP : -Infinity };
    return ranked;
  };
  const isWithinReach = (clubId: string) => {
    const { statures, floor } = rank();
    const stature = statures.get(clubId);
    return stature !== undefined && clubId in state.boards && stature <= coach.reputation + OFFER_REACH && stature >= floor;
  };
  const isNew = (clubId: string) =>
    !isHumanClub(state, clubId) && !offers.some((offer) => offer.clubId === clubId) && !isCoolingDown(coach, clubId, state.season) && rivalBlockOf(state, clubId) === null;
  const offering = vacancies.filter((id) => isWithinReach(id) && isNew(id));
  if (!coachClubId && !offers.length && !offering.length && random() < IDLE_OFFER_CHANCE_PER_DAY) {
    const reachable = [...rank().statures.keys()].filter((id) => isWithinReach(id) && isNew(id)).sort();
    const pick = reachable[Math.floor(random() * reachable.length)];
    if (pick) offering.push(pick);
  }
  const made = offering.map((clubId) => jobOffer(state, clubId));
  offers = [...offers, ...made];
  if (offers.length === coach.offers.length && !made.length) return { state, events: [] };
  return { state: { ...state, coach: { ...coach, offers } }, events: made.map((offer) => ({ type: "jobOffered", offer })) };
}
