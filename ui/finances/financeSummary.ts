import { totalCosts, totalRevenue } from "../../src/sim/finances/ledger.js";
import { COST_LINES, REVENUE_LINES, type ClubFinance, type CostLine, type GameState, type RevenueLine } from "../../src/sim/gameState.js";
import { wageBillsOf } from "../../src/sim/transfers/wageBillsOf.js";
import { monthName } from "../format/formatGameDate.js";
import { jobSecurity, type JobSecurity } from "../hub/hubSelectors.js";
import { boardGoal } from "../screens/clubChoices.js";

export type StatementLine = { label: string; amount: number };
export type ClosingStatement = {
  /** "janeiro de 2026" */
  month: string;
  revenue: StatementLine[];
  costs: StatementLine[];
  totalRevenue: number;
  totalCosts: number;
  net: number;
  cash: number;
};

const REVENUE_LABELS: Record<RevenueLine, string> = {
  tickets: "Bilheteria",
  tv: "TV",
  membership: "Sócios",
  sponsorship: "Patrocínio",
  otherIncome: "Outras receitas",
  prizes: "Prêmios",
  playerSales: "Venda de jogadores",
};

const COST_LABELS: Record<CostLine, string> = {
  wages: "Salários",
  transferFees: "Compra de jogadores",
  signingFees: "Luvas",
  agentFees: "Empresários",
  infrastructure: "Estrutura",
  interest: "Juros",
  fines: "Multas",
};

function linesOf<L extends string>(lines: readonly L[], amounts: Record<L, number>, labels: Record<L, string>): StatementLine[] {
  return lines
    .filter((line) => amounts[line] !== 0)
    .map((line) => ({ label: labels[line], amount: amounts[line] }))
    .sort((a, b) => b.amount - a.amount);
}

/** The month's closing as one statement: revenue against costs, and the cash it ended with. */
export function closingStatement({ month, ledger, cash }: NonNullable<ClubFinance["lastClosing"]>): ClosingStatement {
  const revenue = totalRevenue(ledger);
  const costs = totalCosts(ledger);
  return {
    month: `${monthName(Number(month.slice(5, 7)))} de ${month.slice(0, 4)}`,
    revenue: linesOf(REVENUE_LINES, ledger.revenue, REVENUE_LABELS),
    costs: linesOf(COST_LINES, ledger.costs, COST_LABELS),
    totalRevenue: revenue,
    totalCosts: costs,
    net: revenue - costs,
    cash,
  };
}

export type BoardSummary = {
  cash: number;
  transferBudget: number;
  /** Monthly, like the wage bill. */
  wageCap: number;
  wageBill: number;
  goal: string | null;
  mood: JobSecurity;
  lateWages: { owed: number; months: number } | null;
};

/** What the coach's board allows and expects, and how it feels about him; null without a club. */
export function boardSummary(state: Pick<GameState, "coachClubId" | "clubs" | "finances" | "boards" | "players" | "market">): BoardSummary | null {
  const clubId = state.coachClubId;
  const finance = clubId ? state.finances[clubId] : undefined;
  if (!clubId || !finance) return null;
  const board = state.boards[clubId];
  const division = state.clubs[clubId]?.division;
  return {
    cash: finance.cash,
    transferBudget: finance.transferBudget,
    wageCap: finance.wageCap,
    wageBill: wageBillsOf(state).get(clubId) ?? 0,
    goal: board && division ? boardGoal(board, division) : null,
    mood: jobSecurity(board),
    lateWages: finance.wagesOwed > 0 ? { owed: finance.wagesOwed, months: finance.lateWageMonths } : null,
  };
}
