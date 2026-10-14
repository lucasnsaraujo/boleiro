import { describe, expect, test } from "vitest";
import { totalCosts, totalRevenue } from "@boleiro/engine/sim/finances/ledger";
import type { ClubFinance } from "@boleiro/engine/sim/gameState";
import { wageBillsOf } from "@boleiro/engine/sim/transfers/wageBillsOf";
import { bundledGameFiles } from "@boleiro/game-client/engine/bundledGameFiles";
import { createEngineSession } from "@boleiro/game-client/engine/createEngineSession";
import { boardSummary, closingStatement } from "./financeSummary.js";

const COACH = "sport-pe";
const session = createEngineSession(bundledGameFiles);
session.apply({ type: "newGame", seed: 5, choices: { coachClubId: COACH } });
session.apply({ type: "advance", days: Array.from({ length: 31 }, () => ({})) });
const game = session.read(["coachClubId", "clubs", "finances", "boards", "players", "market"]);
type FinanceState = typeof game;

const financeOf = (state: FinanceState): ClubFinance => {
  const finance = state.finances[COACH];
  if (!finance) throw new Error("no finances");
  return finance;
};
const withFinance = (patch: Partial<ClubFinance>): FinanceState => ({ ...game, finances: { ...game.finances, [COACH]: { ...financeOf(game), ...patch } } });

describe("the monthly closing statement", () => {
  const closing = financeOf(game).lastClosing;
  if (!closing) throw new Error("January did not close");
  const statement = closingStatement(closing);

  test("its totals match the ledger, and the lines it lists add up to them", () => {
    expect(statement.totalRevenue).toBe(totalRevenue(closing.ledger));
    expect(statement.totalCosts).toBe(totalCosts(closing.ledger));
    expect(statement.revenue.reduce((sum, line) => sum + line.amount, 0)).toBe(statement.totalRevenue);
    expect(statement.costs.reduce((sum, line) => sum + line.amount, 0)).toBe(statement.totalCosts);
    expect(statement.net).toBe(statement.totalRevenue - statement.totalCosts);
    expect(statement.cash).toBe(closing.cash);
  });

  test("names the month and leaves out lines with nothing in them, biggest first", () => {
    expect(statement.month).toBe("janeiro de 2026");
    expect(statement.revenue.every((line) => line.amount !== 0)).toBe(true);
    expect(statement.costs.map((line) => line.label)).toContain("Salários");
    expect(statement.costs.map((line) => line.amount)).toEqual(statement.costs.map((line) => line.amount).toSorted((a, b) => b - a));
  });
});

describe("the board's numbers", () => {
  test("the transfer budget, the wage cap against today's wage bill, the goal and the mood", () => {
    const finance = financeOf(game);
    expect(boardSummary(game)).toMatchObject({
      cash: finance.cash,
      transferBudget: finance.transferBudget,
      wageCap: finance.wageCap,
      wageBill: wageBillsOf(game).get(COACH),
      goal: expect.any(String),
      mood: "Estável",
      lateWages: null,
    });
  });

  test("late wages show what is owed and for how many months", () => {
    expect(boardSummary(withFinance({ wagesOwed: 900_000, lateWageMonths: 2 }))?.lateWages).toEqual({ owed: 900_000, months: 2 });
  });

  test("a coach without a club has no board", () => {
    expect(boardSummary({ ...game, coachClubId: null })).toBeNull();
  });
});
