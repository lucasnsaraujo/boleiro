import { describe, expect, it } from "vitest";
import { advanceDay, type DayEvent } from "../advanceDay.js";
import type { ClubFinance, GameState } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { loadGame, saveGame } from "../saveGame.js";
import { bankLoanLimit, bankLoanQuote, repayBankLoan, takeBankLoan } from "./bankLoan.js";

const CLUB = "bahia-ba";
const start = loadNewGame(5, { coachClubId: CLUB });

const financeOf = (state: GameState, clubId = CLUB): ClubFinance => {
  const finance = state.finances[clubId];
  if (!finance) throw new Error(`no finances for ${clubId}`);
  return finance;
};

const withFinance = (state: GameState, patch: Partial<ClubFinance>): GameState => ({
  ...state,
  finances: { ...state.finances, [CLUB]: { ...financeOf(state), ...patch } },
});

function playUntil(state: GameState, date: string): { state: GameState; events: DayEvent[] } {
  let current = state;
  const events: DayEvent[] = [];
  while (current.date < date) {
    const day = advanceDay(current, {});
    current = day.state;
    events.push(...day.events);
  }
  return { state: current, events };
}

const AMOUNT = 20_000_000;

describe("a bank loan", () => {
  it("pays the same instalment every month, which covers the amount and the interest", () => {
    const quote = bankLoanQuote(AMOUNT, 24);
    expect(quote.instalment * 24).toBeGreaterThan(AMOUNT);
    expect(quote.instalment * 24).toBeLessThan(AMOUNT * 1.5);
    expect(bankLoanQuote(AMOUNT, 12).instalment).toBeGreaterThan(quote.instalment);
  });

  it("puts the money in the bank at once and keeps the loan on the club's books", () => {
    const { state, answer } = takeBankLoan(start, AMOUNT, 24);
    expect(answer.approved).toBe(true);
    expect(financeOf(state).cash).toBe(financeOf(start).cash + AMOUNT);
    expect(financeOf(state).bankLoan).toMatchObject({ amount: AMOUNT, balance: AMOUNT, instalmentsLeft: 24, takenOn: start.date });
  });

  it("lends less to a club whose old debt is bigger, and nothing past the limit", () => {
    const limit = bankLoanLimit(financeOf(start));
    expect(limit).toBeGreaterThan(AMOUNT);
    expect(bankLoanLimit({ ...financeOf(start), legacyDebt: financeOf(start).legacyDebt * 10 })).toBeLessThan(limit);
    expect(takeBankLoan(start, limit + 1_000_000, 24).answer).toMatchObject({ approved: false, reason: "limit" });
  });

  it("lends less once the club already owes the bank", () => {
    const limit = bankLoanLimit(financeOf(start));
    expect(bankLoanLimit({ ...financeOf(start), loans: 10_000_000 })).toBe(limit - 10_000_000);
  });

  it("refuses a second loan while one is running, and terms it does not offer", () => {
    const { state } = takeBankLoan(start, AMOUNT, 24);
    expect(takeBankLoan(state, 1_000_000, 24).answer).toMatchObject({ approved: false, reason: "running" });
    expect(takeBankLoan(start, AMOUNT, 7).answer).toMatchObject({ approved: false, reason: "term" });
    expect(takeBankLoan(start, 0, 24).answer).toMatchObject({ approved: false, reason: "amount" });
  });

  it("charges an instalment at each monthly closing, its interest booked as interest", () => {
    const { state } = takeBankLoan(start, AMOUNT, 24);
    const quote = bankLoanQuote(AMOUNT, 24);
    const without = playUntil(start, "2026-02-01");
    const withLoan = playUntil(state, "2026-02-01");
    const loan = financeOf(withLoan.state).bankLoan;
    expect(loan?.instalmentsLeft).toBe(23);
    const interest = Math.round(AMOUNT * quote.monthlyRate);
    expect(loan?.balance).toBe(AMOUNT - (quote.instalment - interest));
    const closing = (s: GameState) => financeOf(s).lastClosing?.ledger.costs.interest ?? 0;
    expect(closing(withLoan.state) - closing(without.state)).toBe(interest);
  });

  it("is gone after its last instalment", () => {
    const { state } = takeBankLoan(start, AMOUNT, 12);
    const loan = financeOf(state).bankLoan;
    if (!loan) throw new Error("no loan taken");
    const lastMonth = withFinance(state, { bankLoan: { ...loan, balance: 1_000_000, instalmentsLeft: 1 } });
    const paid = playUntil(lastMonth, "2026-02-01").state;
    expect(financeOf(paid).bankLoan).toBeUndefined();
  });

  it("can be paid off early with cash in the bank", () => {
    const { state } = takeBankLoan(start, AMOUNT, 24);
    const repaid = repayBankLoan(state);
    expect(financeOf(repaid).bankLoan).toBeUndefined();
    expect(financeOf(repaid).cash).toBe(financeOf(start).cash);
    const broke = withFinance(state, { cash: 1_000_000 });
    expect(() => repayBankLoan(broke)).toThrow();
  });

  it("survives a save and load", () => {
    const { state } = takeBankLoan(start, AMOUNT, 24);
    expect(loadGame(saveGame(state))).toStrictEqual(state);
  });
});
