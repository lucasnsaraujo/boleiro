import { totalCosts, totalRevenue } from "@boleiro/engine/sim/finances/ledger";
import { COST_LINES, REVENUE_LINES, type ClubFinance, type CostLine, type GameState, type Ledger, type RevenueLine } from "@boleiro/engine/sim/gameState";
import { wageBillsOf } from "@boleiro/engine/sim/transfers/wageBillsOf";
import { monthName } from "@boleiro/game-client/format/formatGameDate";
import { jobSecurity, type JobSecurity } from "../hub/hubSelectors.js";
import { boardGoal } from "@boleiro/game-client/screens/clubChoices";

export type StatementLine = { line: RevenueLine | CostLine; label: string; amount: number };
/** Money in against money out over a period. */
export type Statement = {
  revenue: StatementLine[];
  costs: StatementLine[];
  totalRevenue: number;
  totalCosts: number;
  net: number;
};
export type ClosingStatement = Statement & {
  /** "janeiro de 2026" */
  month: string;
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
  friendlies: "Amistosos",
};

const COST_LABELS: Record<CostLine, string> = {
  wages: "Salários",
  transferFees: "Compra de jogadores",
  signingFees: "Luvas",
  agentFees: "Empresários",
  infrastructure: "Estrutura",
  interest: "Juros",
  fines: "Multas",
  friendlies: "Amistosos",
  bonuses: "Bichos",
};

function linesOf<L extends RevenueLine | CostLine>(lines: readonly L[], amounts: Record<L, number>, labels: Record<L, string>): StatementLine[] {
  return lines
    .filter((line) => amounts[line] !== 0)
    .map((line) => ({ line, label: labels[line], amount: amounts[line] }))
    .sort((a, b) => b.amount - a.amount);
}

/** A ledger as one statement: the lines with money in them, biggest first, and the totals. */
export function statementOf(ledger: Ledger): Statement {
  const revenue = totalRevenue(ledger);
  const costs = totalCosts(ledger);
  return {
    revenue: linesOf(REVENUE_LINES, ledger.revenue, REVENUE_LABELS),
    costs: linesOf(COST_LINES, ledger.costs, COST_LABELS),
    totalRevenue: revenue,
    totalCosts: costs,
    net: revenue - costs,
  };
}

/** The month's closing as one statement: revenue against costs, and the cash it ended with. */
export function closingStatement({ month, ledger, cash }: NonNullable<ClubFinance["lastClosing"]>): ClosingStatement {
  return { ...statementOf(ledger), month: `${monthName(Number(month.slice(5, 7)))} de ${month.slice(0, 4)}`, cash };
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
  /** Old debt, the board's overdraft, the bank loan still owed and wages owed. */
  debt: number;
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
    debt: finance.legacyDebt + finance.loans + (finance.bankLoan?.balance ?? 0) + finance.wagesOwed,
  };
}
