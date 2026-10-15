import type { BankLoan, ClubFinance, GameState } from "../gameState.js";
import { projectedRevenue } from "./setBoardBudget.js";

// guess: a fixed-term loan to a football club at 1.4% a month (about 18% a year), a little under the
// automatic overdraft's 20% a year in closeMonth; the approved finances mock quotes the same rate.
export const BANK_LOAN_RATE_PER_MONTH = 0.014;
/** The terms the bank offers, in monthly instalments. */
export const BANK_LOAN_TERMS = [12, 24, 36] as const;
// guess: like the overdraft, the bank lends up to a quarter of a year's revenue, less as the old debt
// grows: a year's revenue of old debt takes a quarter off, three years or more leave a quarter.
const SHARE_OF_REVENUE = 0.25;
const DEBT_YEARS_TO_FLOOR = 4;
const DEBT_FLOOR = 0.25;
// The bank lends in round steps of R$ 100 thousand.
const STEP = 100_000;

export type BankLoanQuote = { amount: number; months: number; monthlyRate: number; instalment: number };

/** Why the bank says no: a loan still running, past the club's limit, an amount below one step, or a term it doesn't offer. */
export type BankLoanRefusal = "running" | "limit" | "amount" | "term";

export type BankLoanAnswer = { approved: true; loan: BankLoan } | { approved: false; reason: BankLoanRefusal };

/** The fixed monthly instalment that repays `amount` with interest over `months`. */
export function bankLoanQuote(amount: number, months: number): BankLoanQuote {
  const rate = BANK_LOAN_RATE_PER_MONTH;
  const instalment = Math.round((amount * rate) / (1 - (1 + rate) ** -months));
  return { amount, months, monthlyRate: rate, instalment };
}

/** The most the bank lends this club now, from its revenue, its old debt and what it already owes. */
export function bankLoanLimit(finance: ClubFinance): number {
  const revenue = projectedRevenue(finance);
  if (revenue <= 0) return 0;
  const debtCut = Math.max(DEBT_FLOOR, 1 - finance.legacyDebt / (DEBT_YEARS_TO_FLOOR * revenue));
  const owed = finance.loans + (finance.bankLoan?.balance ?? 0);
  return Math.max(0, Math.floor((SHARE_OF_REVENUE * revenue * debtCut - owed) / STEP) * STEP);
}

function coachFinance(state: Pick<GameState, "coachClubId" | "finances">): { clubId: string; finance: ClubFinance } {
  const clubId = state.coachClubId;
  const finance = clubId ? state.finances[clubId] : undefined;
  if (!clubId || !finance) throw new Error("the coach has no club to borrow for");
  return { clubId, finance };
}

/** What the bank would answer the coach's club for `amount` over `months`, without asking it. */
export function bankAnswer(state: Pick<GameState, "coachClubId" | "finances" | "date">, amount: number, months: number): BankLoanAnswer {
  const { finance } = coachFinance(state);
  if (finance.bankLoan) return { approved: false, reason: "running" };
  if (!BANK_LOAN_TERMS.some((term) => term === months)) return { approved: false, reason: "term" };
  if (!Number.isInteger(amount) || amount < STEP) return { approved: false, reason: "amount" };
  if (amount > bankLoanLimit(finance)) return { approved: false, reason: "limit" };
  const { instalment, monthlyRate } = bankLoanQuote(amount, months);
  return { approved: true, loan: { amount, balance: amount, monthlyRate, instalment, instalmentsLeft: months, takenOn: state.date } };
}

/** The coach borrows from the bank for his club; an approved loan's money is in the bank today. */
export function takeBankLoan(state: GameState, amount: number, months: number): { state: GameState; answer: BankLoanAnswer } {
  const answer = bankAnswer(state, amount, months);
  if (!answer.approved) return { state, answer };
  const { clubId, finance } = coachFinance(state);
  return { state: { ...state, finances: { ...state.finances, [clubId]: { ...finance, cash: finance.cash + amount, bankLoan: answer.loan } } }, answer };
}

/** The coach pays off what his club still owes the bank, from cash; refused without the cash. */
export function repayBankLoan(state: GameState): GameState {
  const { clubId, finance } = coachFinance(state);
  const loan = finance.bankLoan;
  if (!loan) throw new Error("the club owes the bank nothing");
  if (finance.cash < loan.balance) throw new Error("not enough cash to pay off the loan");
  const repaid: ClubFinance = { ...finance, cash: finance.cash - loan.balance };
  delete repaid.bankLoan;
  return { ...state, finances: { ...state.finances, [clubId]: repaid } };
}

/** One month's instalment: the interest on what is owed and the part of the amount it pays back. */
export function bankInstalment(loan: BankLoan): { interest: number; principal: number; loan: BankLoan | undefined } {
  const interest = Math.round(loan.balance * loan.monthlyRate);
  const principal = loan.instalmentsLeft <= 1 ? loan.balance : Math.min(loan.balance, loan.instalment - interest);
  const balance = loan.balance - principal;
  return { interest, principal, loan: balance > 0 ? { ...loan, balance, instalmentsLeft: loan.instalmentsLeft - 1 } : undefined };
}
