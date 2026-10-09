import { COST_LINES, REVENUE_LINES, type CostLine, type Ledger, type RevenueLine } from "../gameState.js";

const revenueBy = (value: (line: RevenueLine) => number): Record<RevenueLine, number> => ({
  tickets: value("tickets"),
  tv: value("tv"),
  membership: value("membership"),
  sponsorship: value("sponsorship"),
  otherIncome: value("otherIncome"),
  prizes: value("prizes"),
  playerSales: value("playerSales"),
});

const costsBy = (value: (line: CostLine) => number): Record<CostLine, number> => ({
  wages: value("wages"),
  transferFees: value("transferFees"),
  agentFees: value("agentFees"),
  infrastructure: value("infrastructure"),
  interest: value("interest"),
});

export function emptyLedger(): Ledger {
  return { revenue: revenueBy(() => 0), costs: costsBy(() => 0) };
}

export function addLedgers(a: Ledger, b: Ledger): Ledger {
  return {
    revenue: revenueBy((line) => a.revenue[line] + b.revenue[line]),
    costs: costsBy((line) => a.costs[line] + b.costs[line]),
  };
}

export const totalRevenue = (ledger: Ledger): number => REVENUE_LINES.reduce((sum, line) => sum + ledger.revenue[line], 0);
export const totalCosts = (ledger: Ledger): number => COST_LINES.reduce((sum, line) => sum + ledger.costs[line], 0);
