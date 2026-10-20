import { bookMoney } from "../finances/bookMoney.js";
import { acceptOffer } from "./acceptOffer.js";
import { judgeCoaches } from "./judgeCoaches.js";
import { offerJobs } from "./offerJobs.js";
// guess: a firing costs the coach a few reputation points on top of the bad results behind it.
export const FIRING_REPUTATION_COST = 5;
/**
 * The coach career's part of a day, after the matches and the monthly closing: an offer the player
 * accepted, the coach's salary on the first of the month, the boards' verdicts and new job offers.
 */
export function coachCareerDay(state, played, accepted, random) {
    const events = [];
    let next = state;
    if (accepted) {
        const hired = acceptOffer(next, accepted);
        next = hired.state;
        events.push(hired.event);
    }
    const { contract } = next.coach;
    if (next.date.endsWith("-01") && next.coachClubId && contract) {
        next = bookMoney(next, next.coachClubId, { cost: "wages", amount: contract.salary });
    }
    const judged = judgeCoaches(next, played, random);
    next = judged.state;
    events.push(...judged.events);
    if (judged.events.some((e) => e.isYou)) {
        next = { ...next, coach: { ...next.coach, contract: null, reputation: Math.max(0, next.coach.reputation - FIRING_REPUTATION_COST) } };
    }
    const offered = offerJobs(next, judged.vacancies, random);
    events.push(...offered.events);
    return { state: offered.state, events };
}
