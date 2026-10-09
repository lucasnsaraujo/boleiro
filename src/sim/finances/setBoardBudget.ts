import type { ClubFinance } from "../gameState.js";

// guess: EY's 2025 report puts Série A men's payrolls at roughly half of revenue; the board allows a bit more.
const WAGE_CAP_SHARE_OF_REVENUE = 0.6;
// guess: a slice of the year's revenue for fees, plus half of the cash above a safety cushion.
const TRANSFER_SHARE_OF_REVENUE = 0.1;
const SPARE_CASH_SHARE = 0.5;
const CUSHION_MONTHS_OF_WAGES = 3;

/** Yearly revenue the board expects without player sales. */
export function projectedRevenue(finance: ClubFinance): number {
  return finance.tv + finance.sponsorship + finance.membership + finance.otherIncome + finance.expectedTickets;
}

/** The board's transfer budget and monthly wage cap, from expected revenue and spare cash. */
export function setBoardBudget(finance: ClubFinance, monthlyWages: number): ClubFinance {
  const revenue = projectedRevenue(finance);
  const spareCash = finance.cash - finance.loans - finance.wagesOwed - CUSHION_MONTHS_OF_WAGES * monthlyWages;
  return {
    ...finance,
    wageCap: Math.round((WAGE_CAP_SHARE_OF_REVENUE * revenue) / 12),
    transferBudget: Math.max(0, Math.round(TRANSFER_SHARE_OF_REVENUE * revenue + SPARE_CASH_SHARE * spareCash)),
  };
}
