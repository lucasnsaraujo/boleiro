import { copyRecord } from "../copyRecord.js";
import type { ClubFinance, GameState, Ledger } from "../gameState.js";
import { marketView, type MarketView } from "../transfers/marketView.js";
import { openDraft } from "../transfers/movePlayer.js";
import { wageBillsOf } from "../transfers/wageBillsOf.js";
import { forceSale, type ForcedSale } from "./forceSale.js";
import { bankInstalment } from "./bankLoan.js";
import { addLedgers, emptyLedger } from "./ledger.js";
import { CUSHION_MONTHS_OF_WAGES, projectedRevenue, setBoardBudget, TRANSFER_SHARE_OF_REVENUE } from "./setBoardBudget.js";
import { pow } from "../portableMath.js";

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
  /** Loans, the bank loan's instalments less their interest, and old debt paid back at this closing. */
  debtRepaid: number;
};
export type WagesLate = { type: "wagesLate"; clubId: string; owed: number; months: number };
export type FinanceEvent = MonthClosed | WagesLate | ForcedSale;

// guess: banks lend a club up to a quarter of a year's revenue.
const LOAN_CAP_SHARE_OF_REVENUE = 0.25;
// Selic at 15% a year (Copom, June 2025) plus a guessed 5-point spread for football clubs.
const LOAN_RATE_PER_MONTH = pow(1.2, 1 / 12) - 1;
// guess: the board sells without asking from the second month in a row of late wages.
const FORCED_SALE_AFTER_LATE_MONTHS = 2;
// guess: members join after a good month and leave after a bad one or when wages go unpaid.
const MEMBERSHIP_DRIFT = { goodMonth: 1.01, badMonth: 0.99, lateWages: 0.98, floor: 0.5, ceiling: 1.5 };
// The mid-year window opens on 20 July (CBF 2026, transfers/transferWindows.ts); the board resets the
// budget at the July closing, before it.
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

/**
 * Pays one club's recurring money for the month and its bank loan's instalment, borrowing or paying
 * wages late if cash runs out.
 */
function settle(finance: ClubFinance, wages: number): { finance: ClubFinance; borrowed: number; bankRepaid: number } {
  const revenue = {
    tv: Math.round(finance.tv / 12),
    sponsorship: Math.round(finance.sponsorship / 12),
    membership: Math.round(finance.membership / 12),
    otherIncome: Math.round(finance.otherIncome / 12),
  };
  const bank = finance.bankLoan && bankInstalment(finance.bankLoan);
  const interest = Math.round(finance.loans * LOAN_RATE_PER_MONTH) + (bank?.interest ?? 0);
  const costs = { wages, infrastructure: Math.round(finance.infrastructure / 12), interest };
  let cash = finance.cash + revenue.tv + revenue.sponsorship + revenue.membership + revenue.otherIncome - costs.wages - costs.infrastructure - costs.interest - (bank?.principal ?? 0);
  let { loans, wagesOwed } = finance;
  const bankOwed = bank?.loan?.balance ?? 0;
  const borrowed = cash < 0 ? Math.min(-cash, Math.max(0, LOAN_CAP_SHARE_OF_REVENUE * projectedRevenue(finance) - loans - bankOwed)) : 0;
  loans += borrowed;
  cash += borrowed;
  if (cash < 0) {
    wagesOwed += -cash;
    cash = 0;
  }
  const { month } = finance;
  const rest: ClubFinance = { ...finance };
  delete rest.bankLoan;
  return {
    borrowed: Math.round(borrowed),
    bankRepaid: bank?.principal ?? 0,
    finance: {
      ...(bank?.loan ? { ...finance, bankLoan: bank.loan } : rest),
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

/**
 * Uses spare cash to pay wage arrears first, then loans above a cushion of wages, then the old
 * debt above that cushion plus the season's transfer reserve. Cash the coach borrowed from the bank
 * and still owes is his to spend, so the board leaves it out of the spare cash.
 */
function payDown(finance: ClubFinance, wages: number): ClubFinance {
  const arrears = Math.min(finance.cash, finance.wagesOwed);
  let cash = finance.cash - arrears;
  const cushion = CUSHION_MONTHS_OF_WAGES * wages + (finance.bankLoan?.balance ?? 0);
  const repaid = Math.max(0, Math.min(finance.loans, cash - cushion));
  cash -= repaid;
  const reserve = cushion + TRANSFER_SHARE_OF_REVENUE * projectedRevenue(finance);
  const settled = Math.round(Math.max(0, Math.min(finance.legacyDebt, cash - reserve)));
  return {
    ...finance,
    wagesOwed: finance.wagesOwed - arrears,
    cash: cash - settled,
    loans: finance.loans - repaid,
    legacyDebt: finance.legacyDebt - settled,
  };
}

/** The board's monthly closing for every club, run on the first day of a month for the month before. */
export function closeMonth(state: GameState, random: () => number): { state: GameState; events: FinanceEvent[] } {
  const wagesOf = wageBillsOf(state);
  const month = previousMonth(state.date);
  const events: FinanceEvent[] = [];
  // One copy of the finances map for the whole closing; each club's entry is replaced in place.
  let current: GameState = { ...state, finances: copyRecord(state.finances) };
  // Opened at the first forced sale, then shared by the rest of the closing's sales.
  let view: MarketView | null = null;
  for (const clubId of Object.keys(state.finances).sort()) {
    const opening = current.finances[clubId];
    if (!opening) continue;
    const wages = wagesOf.get(clubId) ?? 0;
    const settled = settle(opening, wages);
    let finance = payDown(settled.finance, wages);
    const late = finance.wagesOwed > 0;
    finance = { ...finance, lateWageMonths: late ? finance.lateWageMonths + 1 : 0, membership: membershipAfter(finance, late) };
    current.finances[clubId] = finance;
    if (late) events.push({ type: "wagesLate", clubId, owed: finance.wagesOwed, months: finance.lateWageMonths });
    if (late && finance.lateWageMonths >= FORCED_SALE_AFTER_LATE_MONTHS) {
      if (!view) {
        current = openDraft(current);
        view = marketView(current);
      }
      const sold = forceSale(current, clubId, random, view);
      if (sold) {
        events.push(sold.sale);
        current = sold.state;
      }
    }
    const closed = current.finances[clubId] ?? finance;
    const paid = payDown(closed, wages);
    const ledger: Ledger = { revenue: paid.month.revenue, costs: paid.month.costs };
    const budgeted = state.date.slice(5, 7) === MID_YEAR_WINDOW_MONTH ? setBoardBudget(paid, wages) : paid;
    current.finances[clubId] = {
      ...budgeted,
      season: addLedgers(paid.season, ledger),
      month: { ...emptyLedger(), points: 0, games: 0 },
      lastClosing: { month, ledger, cash: paid.cash },
    };
    events.push({
      type: "monthClosed", clubId, month, ledger, cash: paid.cash, loans: paid.loans, wagesOwed: paid.wagesOwed, borrowed: settled.borrowed,
      debtRepaid: opening.loans + settled.borrowed - paid.loans + opening.legacyDebt - paid.legacyDebt + settled.bankRepaid,
    });
  }
  return { state: current, events };
}
