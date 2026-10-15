import { copyRecord } from "../copyRecord.js";
import { addDays, daysBetween } from "../dates.js";
import { bookMoneyInDraft } from "../finances/bookMoney.js";
import { crowdDemand, median, SELLABLE_SHARE_OF_CAPACITY } from "../finances/openingFinances.js";
import { tierOf } from "../finances/tierOf.js";
import type { ClubFinance, GameState, IsoDate } from "../gameState.js";

export type StadiumOpened = { type: "stadiumOpened"; clubId: string; seats: number; capacity: number };

/** What new seats would cost and how long they take to build. */
export type WorksQuote = { seats: number; cost: number; months: number; installment: number };

/** Why the board turns down works: some under way, past the biggest stadium, no trust in the coach, or no cash. */
export type WorksRefusal = "building" | "capacity" | "trust" | "cash";

export type WorksAnswer = ({ approved: true } | { approved: false; reason: WorksRefusal }) & { quote: WorksQuote };

// Arena MRV's building work cost about R$ 742 million for 46,000 seats, about R$ 16,000 a seat, and
// took 40 months, April 2020 to August 2023 (NSC Total, Itatiaia); Santos budgets the new Vila Belmiro at
// R$ 700 million for 30,000 seats in 40 months (MKT Esportivo, Aug 2025). guess: adding a stand costs
// what a seat costs in a new stadium, and takes four months of design and permits plus a month for
// every 1,250 seats, so a whole new 46,000-seat stadium takes about the real 40 months.
const COST_PER_SEAT = 16_000;
const BASE_MONTHS = 4;
const SEATS_PER_MONTH = 1_250;
const MAX_MONTHS = 40;
const DAYS_PER_MONTH = 30;
// guess: no Brazilian stadium holds more than the Maracanã's 78,838 seats; the board stops at 90,000.
const MAX_CAPACITY = 90_000;
// guess: the board signs only with half of the bill in the bank (after loans and unpaid wages), the
// rest coming from revenue during the works, and only for a coach it doesn't doubt (board pressure,
// a quarter of the table short of target on average, see judgeCoaches).
const CASH_SHARE_UP_FRONT = 0.5;
const MAX_PRESSURE = 0.25;

/** The price and the building time of `seats` new seats. */
export function worksQuote(seats: number): WorksQuote {
  if (!Number.isInteger(seats) || seats <= 0) throw new Error("works add a positive whole number of seats");
  const cost = seats * COST_PER_SEAT;
  const months = Math.min(MAX_MONTHS, BASE_MONTHS + Math.ceil(seats / SEATS_PER_MONTH));
  return { seats, cost, months, installment: Math.round(cost / months) };
}

/** Cash the board counts as free for works: the bank balance less loans and wages owed. */
export function freeCash(finance: Pick<ClubFinance, "cash" | "loans" | "wagesOwed">): number {
  return finance.cash - finance.loans - finance.wagesOwed;
}

/** What the coach's board would answer to a request for `seats` new seats, without asking it. */
export function boardAnswerToWorks(state: Pick<GameState, "coachClubId" | "clubs" | "finances" | "boards">, seats: number): WorksAnswer {
  const quote = worksQuote(seats);
  const clubId = state.coachClubId;
  const club = clubId ? state.clubs[clubId] : undefined;
  const finance = clubId ? state.finances[clubId] : undefined;
  if (!clubId || !club || !finance) throw new Error("the coach has no club to build for");
  const refuse = (reason: WorksRefusal): WorksAnswer => ({ approved: false, reason, quote });
  if (finance.stadiumWorks) return refuse("building");
  if (club.capacity + seats > MAX_CAPACITY) return refuse("capacity");
  if ((state.boards[clubId]?.pressure ?? 0) > MAX_PRESSURE) return refuse("trust");
  if (freeCash(finance) < CASH_SHARE_UP_FRONT * quote.cost) return refuse("cash");
  return { approved: true, quote };
}

/** The coach asks his board for new seats; works it approves start today. */
export function requestStadiumWorks(state: GameState, seats: number): { state: GameState; answer: WorksAnswer } {
  const answer = boardAnswerToWorks(state, seats);
  const clubId = state.coachClubId;
  const finance = clubId ? state.finances[clubId] : undefined;
  if (!answer.approved || !clubId || !finance) return { state, answer };
  const { cost, months } = answer.quote;
  const stadiumWorks = { seats, cost, paid: 0, startedOn: state.date, opensOn: addDays(state.date, months * DAYS_PER_MONTH) };
  return { state: { ...state, finances: { ...state.finances, [clubId]: { ...finance, stadiumWorks } } }, answer };
}

type SeatsState = Pick<GameState, "clubs" | "finances" | "economy">;

/**
 * The club with `seats` more seats open: a bigger stadium, and a usual crowd that fills what the fans
 * wanted and the old stands couldn't hold.
 */
export function withNewSeats<S extends SeatsState>(state: S, clubId: string, seats: number): S {
  const club = state.clubs[clubId];
  const finance = state.finances[clubId];
  if (!club || !finance) return state;
  const capacity = club.capacity + seats;
  const tier = tierOf(club);
  const fanbases = Object.values(state.clubs).filter((other) => tierOf(other) === tier).map((other) => other.fanbase);
  const wanted = crowdDemand(state.economy.matchday[tier].attendance, club.fanbase, median(fanbases));
  const baseCrowd = Math.max(finance.baseCrowd, Math.round(Math.min(SELLABLE_SHARE_OF_CAPACITY * capacity, wanted)));
  return {
    ...state,
    clubs: { ...state.clubs, [clubId]: { ...club, capacity } },
    finances: { ...state.finances, [clubId]: { ...finance, baseCrowd } },
  };
}

/**
 * The stadium works as `today` starts: on the first of each month every club building pays an
 * instalment, and works whose day has come open their seats, paying what is left of the bill.
 */
export function buildStadiums(state: GameState, today: IsoDate): { state: GameState; events: StadiumOpened[] } {
  const building = Object.entries(state.finances).filter(([, finance]) => finance.stadiumWorks);
  if (!building.length) return { state, events: [] };
  let next: GameState = { ...state, finances: copyRecord(state.finances) };
  const events: StadiumOpened[] = [];
  for (const [clubId, { stadiumWorks: works }] of building) {
    if (!works) continue;
    const opens = today >= works.opensOn;
    const months = Math.max(1, Math.round(daysBetween(works.startedOn, works.opensOn) / DAYS_PER_MONTH));
    const installment = Math.round(works.cost / months);
    const due = opens ? works.cost - works.paid : today.endsWith("-01") ? Math.min(works.cost - works.paid, installment) : 0;
    if (due > 0) bookMoneyInDraft(next.finances, clubId, { cost: "infrastructure", amount: due });
    const paid = next.finances[clubId];
    if (!paid) continue;
    if (!opens) {
      next.finances[clubId] = { ...paid, stadiumWorks: { ...works, paid: works.paid + due } };
      continue;
    }
    const done: ClubFinance = { ...paid };
    delete done.stadiumWorks;
    next.finances[clubId] = done;
    next = withNewSeats(next, clubId, works.seats);
    events.push({ type: "stadiumOpened", clubId, seats: works.seats, capacity: next.clubs[clubId]?.capacity ?? 0 });
  }
  return { state: next, events };
}
