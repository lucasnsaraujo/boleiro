import { addDays } from "../dates.js";
import { bookMoney } from "../finances/bookMoney.js";
import type { Fixture, GameState } from "../gameState.js";
import { recordCoachEvents } from "../history/recordDayEvents.js";
import { acceptOffer, type CoachHired } from "./acceptOffer.js";
import { asWaitingCoach, isHumanClub, waitingCoachesOf } from "./humanCoaches.js";
import { judgeCoaches, type CoachFired } from "./judgeCoaches.js";
import { offerJobs, type JobOffered } from "./offerJobs.js";

// guess: a firing costs the coach a few reputation points on top of the bad results behind it.
export const FIRING_REPUTATION_COST = 5;

type CareerEvent = CoachHired | CoachFired | JobOffered;

/** The coach in the seat after the day's offer he accepted, and his and his hired assistant's salaries on the first of the month. */
function hireAndPay(state: GameState, accepted: string | undefined, events: CareerEvent[]): GameState {
  let next = state;
  // Another hot-seat coach may have taken the club since it made the offer.
  if (accepted && !isHumanClub(next, accepted)) {
    const hired = acceptOffer(next, accepted);
    next = hired.state;
    events.push(hired.event);
  }
  const { contract, assistant } = next.coach;
  if (next.date.endsWith("-01") && next.coachClubId && contract) {
    next = bookMoney(next, next.coachClubId, { cost: "wages", amount: contract.salary });
  }
  if (next.date.endsWith("-01") && next.coachClubId && assistant?.wage) {
    next = bookMoney(next, next.coachClubId, { cost: "wages", amount: assistant.wage });
  }
  return next;
}

function fired(state: GameState): GameState {
  return { ...state, coach: { ...state.coach, contract: null, reputation: Math.max(0, state.coach.reputation - FIRING_REPUTATION_COST) } };
}

/**
 * A waiting hot-seat coach's part of the day, as if he sat in the seat: his firing if his board sacked
 * him, the offer he accepted on his turn, his salary and new offers. His events go into his own record.
 */
function waitingCareerDay(
  seated: GameState,
  judged: readonly CoachFired[],
  accepted: string | undefined,
  vacancies: readonly string[],
  random: () => number,
): { state: GameState; events: CareerEvent[] } {
  const events: CareerEvent[] = [];
  let next = seated;
  const sacking = judged.find((event) => event.clubId === seated.coachClubId);
  if (sacking) {
    next = fired({ ...next, coachClubId: null });
    events.push({ ...sacking, isYou: true });
  }
  next = hireAndPay(next, accepted, events);
  const offered = offerJobs(next, vacancies, random);
  events.push(...offered.events);
  return { state: recordCoachEvents(offered.state, events, addDays(seated.date, -1)), events };
}

/**
 * The coach career's part of a day, after the matches and the monthly closing: an offer the player
 * accepted, the coach's salary on the first of the month, the boards' verdicts and new job offers. In a
 * hot-seat game each waiting coach then gets his own part, with the offer he accepted on his turn
 * (`waitingAccepted`, in waiting order); his events come back apart, in `waitingEvents`. `vacancies` are
 * the clubs whose boards fired their coach today.
 */
export function coachCareerDay(
  state: GameState,
  played: readonly Fixture[],
  accepted: string | undefined,
  random: () => number,
  waitingAccepted: readonly (string | undefined)[] = [],
): { state: GameState; events: CareerEvent[]; waitingEvents: CareerEvent[][]; vacancies: string[] } {
  const events: CareerEvent[] = [];
  let next = hireAndPay(state, accepted, events);
  const judged = judgeCoaches(next, played, random);
  next = judged.state;
  events.push(...judged.events);
  if (judged.events.some((e) => e.isYou)) next = fired(next);
  const offered = offerJobs(next, judged.vacancies, random);
  events.push(...offered.events);
  next = offered.state;
  const waitingEvents: CareerEvent[][] = [];
  for (let index = 0; index < waitingCoachesOf(next).length; index++) {
    const own = asWaitingCoach(next, index, (seated) => waitingCareerDay(seated, judged.events, waitingAccepted[index], judged.vacancies, random));
    next = own.state;
    waitingEvents.push(own.events);
  }
  return { state: next, events, waitingEvents, vacancies: judged.vacancies };
}
