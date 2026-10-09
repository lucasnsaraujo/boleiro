import type { ClubFinance, GameState, Ledger } from "../gameState.js";
import { forceSale, type ForcedSale } from "./forceSale.js";
import { addLedgers, emptyLedger } from "./ledger.js";
import { projectedRevenue, setBoardBudget } from "./setBoardBudget.js";

export type MonthClosed = {
  type: "monthClosed";
  clubId: string;
  /** The month closed, as `YYYY-MM`. */
  month: string;
  ledger: Ledger;
  cash: number;
  loans: number;
  wagesOwed: number;
  /** Loan the board took at this closing. */
  borrowed: number;
};
export type WagesLate = { type: "wagesLate"; clubId: string; owed: number; months: number };
export type FinanceEvent = MonthClosed | WagesLate | ForcedSale;

// guess: banks lend a club up to a quarter of a year's revenue.
const LOAN_CAP_SHARE_OF_REVENUE = 0.25;
// Selic at 15% a year (Copom, June 2025) plus a guessed 5-point spread for football clubs.
const LOAN_RATE_PER_MONTH = 1.2 ** (1 / 12) - 1;
// guess: the board sells without asking from the second month in a row of late wages.
const FORCED_SALE_AFTER_LATE_MONTHS = 2;
// guess: the board repays loans with cash above three months of wages.
const CASH_CUSHION_MONTHS_OF_WAGES = 3;
// guess: members join after a good month and leave after a bad one or when wages go unpaid.
const MEMBERSHIP_DRIFT = { goodMonth: 1.01, badMonth: 0.99, lateWages: 0.98, floor: 0.5, ceiling: 1.5 };
// guess: the mid-year window of the spec (#2) opens in July, as it usually does in Brazil; the board resets the budget then.
const MID_YEAR_WINDOW_MONTH = "07";

const previousMonth = (date: string): string => {
  const [year, month] = date.split("-").map(Number);
  if (!year || !month) throw new Error(`bad date ${date}`);
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
};

function membershipAfter(finance: ClubFinance, late: boolean): number {
  const { games, points } = finance.month;
  const perGame = games ? points / games : 1.5;
  const drift = (perGame >= 2 ? MEMBERSHIP_DRIFT.goodMonth : perGame < 1 ? MEMBERSHIP_DRIFT.badMonth : 1) * (late ? MEMBERSHIP_DRIFT.lateWages : 1);
  const anchor = finance.membershipAnchor;
  return Math.round(Math.min(MEMBERSHIP_DRIFT.ceiling * anchor, Math.max(MEMBERSHIP_DRIFT.floor * anchor, finance.membership * drift)));
}

/** Pays one club's recurring money for the month, borrowing or paying wages late if cash runs out. */
function settle(finance: ClubFinance, wages: number): { finance: ClubFinance; borrowed: number } {
  const revenue = {
    tv: Math.round(finance.tv / 12),
    sponsorship: Math.round(finance.sponsorship / 12),
    membership: Math.round(finance.membership / 12),
    otherIncome: Math.round(finance.otherIncome / 12),
  };
  const costs = { wages, infrastructure: Math.round(finance.infrastructure / 12), interest: Math.round(finance.loans * LOAN_RATE_PER_MONTH) };
  let cash = finance.cash + revenue.tv + revenue.sponsorship + revenue.membership + revenue.otherIncome - costs.wages - costs.infrastructure - costs.interest;
  let { loans, wagesOwed } = finance;
  const borrowed = cash < 0 ? Math.min(-cash, Math.max(0, LOAN_CAP_SHARE_OF_REVENUE * projectedRevenue(finance) - loans)) : 0;
  loans += borrowed;
  cash += borrowed;
  if (cash < 0) {
    wagesOwed += -cash;
    cash = 0;
  }
  const { month } = finance;
  return {
    borrowed: Math.round(borrowed),
    finance: {
      ...finance,
      cash,
      loans: Math.round(loans),
      wagesOwed: Math.round(wagesOwed),
      month: {
        ...month,
        revenue: {
          ...month.revenue,
          tv: month.revenue.tv + revenue.tv,
          sponsorship: month.revenue.sponsorship + revenue.sponsorship,
          membership: month.revenue.membership + revenue.membership,
          otherIncome: month.revenue.otherIncome + revenue.otherIncome,
        },
        costs: {
          ...month.costs,
          wages: month.costs.wages + costs.wages,
          infrastructure: month.costs.infrastructure + costs.infrastructure,
          interest: month.costs.interest + costs.interest,
        },
      },
    },
  };
}

/** Uses spare cash to pay wage arrears first, then loans above a cushion. */
function payDown(finance: ClubFinance, wages: number): ClubFinance {
  const arrears = Math.min(finance.cash, finance.wagesOwed);
  const afterArrears = finance.cash - arrears;
  const repaid = Math.max(0, Math.min(finance.loans, afterArrears - CASH_CUSHION_MONTHS_OF_WAGES * wages));
  return { ...finance, wagesOwed: finance.wagesOwed - arrears, cash: afterArrears - repaid, loans: finance.loans - repaid };
}

/** The board's monthly closing for every club, run on the first day of a month for the month before. */
export function closeMonth(state: GameState, random: () => number): { state: GameState; events: FinanceEvent[] } {
  const wagesOf = new Map<string, number>();
  for (const player of Object.values(state.players)) wagesOf.set(player.clubId, (wagesOf.get(player.clubId) ?? 0) + player.wage);
  const month = previousMonth(state.date);
  const events: FinanceEvent[] = [];
  let current = state;
  for (const clubId of Object.keys(state.finances).sort()) {
    const opening = current.finances[clubId];
    if (!opening) continue;
    const wages = wagesOf.get(clubId) ?? 0;
    const settled = settle(opening, wages);
    let finance = payDown(settled.finance, wages);
    const late = finance.wagesOwed > 0;
    finance = { ...finance, lateWageMonths: late ? finance.lateWageMonths + 1 : 0, membership: membershipAfter(finance, late) };
    current = { ...current, finances: { ...current.finances, [clubId]: finance } };
    if (late) events.push({ type: "wagesLate", clubId, owed: finance.wagesOwed, months: finance.lateWageMonths });
    if (late && finance.lateWageMonths >= FORCED_SALE_AFTER_LATE_MONTHS) {
      const sold = forceSale(current, clubId, random);
      if (sold) {
        events.push(sold.sale);
        current = sold.state;
      }
    }
    const closed = current.finances[clubId] ?? finance;
    const paid = payDown(closed, wages);
    const ledger: Ledger = { revenue: paid.month.revenue, costs: paid.month.costs };
    const budgeted = state.date.slice(5, 7) === MID_YEAR_WINDOW_MONTH ? setBoardBudget(paid, wages) : paid;
    current = {
      ...current,
      finances: {
        ...current.finances,
        [clubId]: { ...budgeted, season: addLedgers(paid.season, ledger), month: { ...emptyLedger(), points: 0, games: 0 } },
      },
    };
    events.push({ type: "monthClosed", clubId, month, ledger, cash: paid.cash, loans: paid.loans, wagesOwed: paid.wagesOwed, borrowed: settled.borrowed });
  }
  return { state: current, events };
}
