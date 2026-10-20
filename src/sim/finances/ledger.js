import { COST_LINES, REVENUE_LINES } from "../gameState.js";
const revenueBy = (value) => ({
    tickets: value("tickets"),
    tv: value("tv"),
    membership: value("membership"),
    sponsorship: value("sponsorship"),
    otherIncome: value("otherIncome"),
    prizes: value("prizes"),
    playerSales: value("playerSales"),
});
const costsBy = (value) => ({
    wages: value("wages"),
    transferFees: value("transferFees"),
    signingFees: value("signingFees"),
    agentFees: value("agentFees"),
    infrastructure: value("infrastructure"),
    interest: value("interest"),
    fines: value("fines"),
});
export function emptyLedger() {
    return { revenue: revenueBy(() => 0), costs: costsBy(() => 0) };
}
export function addLedgers(a, b) {
    return {
        revenue: revenueBy((line) => a.revenue[line] + b.revenue[line]),
        costs: costsBy((line) => a.costs[line] + b.costs[line]),
    };
}
export const totalRevenue = (ledger) => REVENUE_LINES.reduce((sum, line) => sum + ledger.revenue[line], 0);
export const totalCosts = (ledger) => COST_LINES.reduce((sum, line) => sum + ledger.costs[line], 0);
