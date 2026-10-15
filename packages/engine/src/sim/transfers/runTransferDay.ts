import { randomStream } from "../../engine/random.js";
import type { GameState } from "../gameState.js";
import { unitHash } from "./coachMarket.js";
import { coachMarketDay } from "./coachMarketDay.js";
import type { CoachRequest } from "./coachRequest.js";
import { decideCoachRequest } from "./decideCoachRequest.js";
import { driftExchangeRate } from "./driftExchangeRate.js";
import { europeBids } from "./europeBids.js";
import { expireContracts, hasExpiries } from "./expireContracts.js";
import { lendYoungPlayers, returnLoans } from "./loans.js";
import { openDraft } from "./movePlayer.js";
import { signFreeAgents } from "./signFreeAgents.js";
import { signFromAbroad } from "./signFromAbroad.js";
import { tradeBetweenClubs } from "./tradeBetweenClubs.js";
import type { TransferEvent } from "./transferEvents.js";
import { isMarketDay } from "./transferWindows.js";

type Step = (state: GameState, random: () => number) => { state: GameState; events: TransferEvent[] };

/** Whether the coach has anything on the market today, or clubs may bid for his players. */
function hasCoachBusiness(state: GameState): boolean {
  const coach = state.market.coach;
  const isWaiting = !!coach && Object.values(coach).some((entries) => Object.keys(entries).length > 0);
  return isWaiting || (state.coachClubId !== null && isMarketDay(state.date));
}

/**
 * The transfer market's day, run at the start of `state.date`: loans and contracts that ended, the
 * coach's requests and his own business (offers, listings, auctions), then on market days Europe's bids
 * and the AI clubs' business. Draws come from the market's own random stream.
 */
export function runTransferDay(state: GameState, requests: readonly CoachRequest[]): { state: GameState; events: TransferEvent[] } {
  const random = randomStream(state.market.rngState);
  let serial = 0;
  const nextId = () => `t${state.date}-${serial++}`;
  const steps: Step[] = [];
  if (Object.values(state.market.loans).some((loan) => loan.until < state.date)) steps.push((s) => returnLoans(s));
  if (hasExpiries(state)) steps.push(expireContracts);
  for (const request of requests) steps.push((s, r) => decideCoachRequest(s, request, r));
  if (hasCoachBusiness(state)) {
    // The coach's business draws from its own stream, salted with the day, so it never shifts the AI clubs' draws.
    const coachRandom = randomStream(Math.floor(unitHash(`${state.market.rngState}:${state.date}`) * 2 ** 32));
    steps.push((s) => coachMarketDay(s, coachRandom.next));
  }
  if (isMarketDay(state.date)) steps.push(europeBids, tradeBetweenClubs, (s, r) => signFromAbroad(s, r, nextId), lendYoungPlayers, signFreeAgents);
  // Most days nothing moves; the draft (a copy of every player) is only made when something can.
  let next = steps.length ? openDraft(state) : state;
  const events: TransferEvent[] = [];
  for (const step of steps) {
    const done = step(next, random.next);
    next = done.state;
    events.push(...done.events);
  }
  const eurBrl = state.date.endsWith("-01") ? driftExchangeRate(next.market.eurBrl, random.next) : next.market.eurBrl;
  return { state: { ...next, market: { ...next.market, eurBrl, rngState: random.state() } }, events };
}
