import { randomStream } from "../../engine/random.js";
import { asWaitingCoach, waitingCoachesOf } from "../coach/humanCoaches.js";
import { addDays } from "../dates.js";
import { doesAssistantHandle } from "../coach/assistantDuties.js";
import { assistantRenewals, isSeasonLastDay, nextAssistantReview } from "./assistantRenewals.js";
import { assistantSales } from "./assistantSales.js";
import type { GameState, IsoDate } from "../gameState.js";
import { unitHash } from "./coachMarket.js";
import { coachMarketDay } from "./coachMarketDay.js";
import type { CoachRequest } from "./coachRequest.js";
import { decideCoachRequest } from "./decideCoachRequest.js";
import { driftExchangeRate } from "./driftExchangeRate.js";
import { europeBids } from "./europeBids.js";
import { expireContracts, hasExpiries, renewAiContracts } from "./expireContracts.js";
import { lendYoungPlayers, returnLoans } from "./loans.js";
import { openDraft } from "./movePlayer.js";
import { signFreeAgents } from "./signFreeAgents.js";
import { signFromAbroad } from "./signFromAbroad.js";
import { tradeBetweenClubs } from "./tradeBetweenClubs.js";
import type { TransferEvent } from "./transferEvents.js";
import type { CoachMarket } from "./transferMarket.js";
import { isMarketDay, isWindowOpen, type CoachWindows } from "./transferWindows.js";

type Step = (state: GameState, random: () => number) => { state: GameState; events: TransferEvent[] };

/**
 * Whether the coach's market has anything to do today: offers, counters (renewal ones too) and auctions
 * to lapse or close, listings to find buyers inside the window, or a market day for clubs to bid. Most
 * days it has not.
 */
function hasCoachBusiness(coach: CoachMarket | undefined, coachClubId: string | null, rules: CoachWindows, date: IsoDate): boolean {
  const has = (entries: Record<string, unknown> | undefined) => !!entries && Object.keys(entries).length > 0;
  if (has(coach?.bids) || has(coach?.counters) || has(coach?.auctions) || has(coach?.renewalCounters)) return true;
  return (has(coach?.listings) && isWindowOpen(rules, date)) || (coachClubId !== null && isMarketDay(rules, date));
}

/** The events that are a coach's own news rather than the market's: his board's answers and his business. */
const isCoachNews = (event: TransferEvent) =>
  event.type === "requestDecided" || event.type === "bidReceived" || event.type === "auctionClosed" || event.type === "counterOffered" || event.type === "renewalCountered";

/**
 * The transfer market's day, run at the start of `state.date`: loans that ended, the coaches' renewals
 * (sent the day before, so a contract's last day still counts), contracts that ended, the coach's other
 * requests, his assistant's renewals on the days he looks (and the AI clubs' on the season's last day),
 * and his own business (offers, listings, auctions), then on market days Europe's bids and the AI clubs'
 * business. Draws come from the market's own random stream. In a hot-seat game each waiting coach's
 * requests (`waitingRequests`, in waiting order) and business run as if he sat in the seat; his own news
 * comes back apart, in `waitingEvents`, with the offers other human coaches made for his players. Last, the assistants who run their coach's sales take the offers for players outside the plans.
 */
export function runTransferDay(
  state: GameState,
  requests: readonly CoachRequest[],
  waitingRequests: readonly (readonly CoachRequest[])[] = [],
): { state: GameState; events: TransferEvent[]; waitingEvents: TransferEvent[][] } {
  const random = randomStream(state.market.rngState);
  let serial = 0;
  const nextId = () => `t${state.date}-${serial++}`;
  const steps: { step: Step; waitingIndex?: number }[] = [];
  const add = (...added: Step[]) => steps.push(...added.map((step) => ({ step })));
  const waiting = waitingCoachesOf(state);
  const decide = (request: CoachRequest, waitingIndex?: number) => {
    if (waitingIndex === undefined) add((s, r) => decideCoachRequest(s, request, r));
    else steps.push({ step: (s, r) => asWaitingCoach(s, waitingIndex, (seated) => decideCoachRequest(seated, request, r)), waitingIndex });
  };
  const isRenewal = (request: CoachRequest) => request.kind === "renew";
  if (Object.values(state.market.loans).some((loan) => loan.until < state.date)) add((s) => returnLoans(s));
  // A renewal sent on a contract's last day is answered before the contract runs out.
  for (const request of requests.filter(isRenewal)) decide(request);
  waiting.forEach((_, waitingIndex) => {
    for (const request of (waitingRequests[waitingIndex] ?? []).filter(isRenewal)) decide(request, waitingIndex);
  });
  if (hasExpiries(state)) add(expireContracts);
  for (const request of requests.filter((request) => !isRenewal(request))) decide(request);
  const isReviewDay = nextAssistantReview(state, addDays(state.date, -1)) === state.date;
  if (isReviewDay) add((s) => assistantRenewals(s));
  if (isSeasonLastDay(state.date)) add((s) => renewAiContracts(s));
  if (hasCoachBusiness(state.market.coach, state.coachClubId, state, state.date)) {
    // The coach's business draws from its own stream, salted with the day, so it never shifts the AI clubs' draws.
    const coachRandom = randomStream(Math.floor(unitHash(`${state.market.rngState}:${state.date}`) * 2 ** 32));
    add((s) => coachMarketDay(s, coachRandom.next));
  }
  waiting.forEach((coach, waitingIndex) => {
    for (const request of (waitingRequests[waitingIndex] ?? []).filter((request) => !isRenewal(request))) decide(request, waitingIndex);
    if (isReviewDay) steps.push({ step: (s) => asWaitingCoach(s, waitingIndex, assistantRenewals), waitingIndex });
    if (!hasCoachBusiness(coach.market, coach.clubId, { ...state, coach: coach.coach }, state.date)) return;
    const waitingRandom = randomStream(Math.floor(unitHash(`${state.market.rngState}:${state.date}:${waitingIndex}`) * 2 ** 32));
    steps.push({ step: (s) => asWaitingCoach(s, waitingIndex, (seated) => coachMarketDay(seated, waitingRandom.next)), waitingIndex });
  });
  if (isMarketDay(state, state.date)) {
    add(europeBids, tradeBetweenClubs, (s, r) => signFromAbroad(s, r, nextId), lendYoungPlayers, signFreeAgents);
    waiting.forEach((coach, waitingIndex) => {
      if (coach.clubId) steps.push({ step: (s, r) => asWaitingCoach(s, waitingIndex, (seated) => europeBids(seated, r, coach.clubId ?? undefined)), waitingIndex });
    });
  }
  // An assistant who runs his coach's sales answers the offers standing at the end of the day's business.
  const mayGetBids = (coach: CoachMarket | undefined, coachClubId: string | null, rules: CoachWindows) => hasCoachBusiness(coach, coachClubId, rules, state.date) || isMarketDay(state, state.date);
  if (doesAssistantHandle(state.coach, "selling") && mayGetBids(state.market.coach, state.coachClubId, state)) add((s) => assistantSales(s));
  waiting.forEach((coach, waitingIndex) => {
    if (!doesAssistantHandle(coach.coach, "selling") || !mayGetBids(coach.market, coach.clubId, { ...state, coach: coach.coach })) return;
    steps.push({ step: (s) => asWaitingCoach(s, waitingIndex, assistantSales), waitingIndex });
  });
  // Most days nothing moves; the draft (a copy of every player) is only made when something can.
  let next = steps.length ? openDraft(state) : state;
  const events: TransferEvent[] = [];
  const waitingEvents: TransferEvent[][] = waiting.map(() => []);
  // An offer is news for the coach whose player it is, who may not be the one whose step made it (another human coach's offer).
  const newsOf = (event: TransferEvent, waitingIndex: number | undefined, after: GameState): number | undefined => {
    if (event.type !== "bidReceived") return waitingIndex;
    const sellerId = after.players[event.playerId]?.clubId;
    const seller = waitingCoachesOf(after).findIndex((coach) => coach.clubId === sellerId);
    return seller >= 0 ? seller : sellerId === after.coachClubId ? undefined : waitingIndex;
  };
  for (const { step, waitingIndex } of steps) {
    const done = step(next, random.next);
    next = done.state;
    for (const event of done.events) {
      const own = isCoachNews(event) ? newsOf(event, waitingIndex, next) : undefined;
      (own === undefined ? events : (waitingEvents[own] ?? events)).push(event);
    }
  }
  const eurBrl = state.date.endsWith("-01") ? driftExchangeRate(next.market.eurBrl, random.next) : next.market.eurBrl;
  return { state: { ...next, market: { ...next.market, eurBrl, rngState: random.state() } }, events, waitingEvents };
}
