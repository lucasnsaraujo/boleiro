/**
 * The board's reason to refuse a deal, or null when it approves: up-front money must fit the
 * transfer budget and the new wage bill the wage cap (a deal that lowers the bill always fits).
 */
export function boardRefusal(finance, monthlyWageBill, cost) {
    if (cost.upFront > finance.transferBudget)
        return "transferBudget";
    if (cost.wageChange > 0 && monthlyWageBill + cost.wageChange > finance.wageCap)
        return "wageCap";
    return null;
}
