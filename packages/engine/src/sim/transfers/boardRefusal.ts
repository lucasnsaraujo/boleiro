import type { ClubFinance } from "../gameState.js";

/** What a deal costs the club: up-front money (fee, bonus, agent) and the change in its monthly wage bill. */
export type DealCost = { upFront: number; wageChange: number };

/**
 * The board's reason to refuse a deal, or null when it approves: up-front money must fit the
 * transfer budget and the new wage bill the wage cap (a deal that lowers the bill always fits).
 */
export function boardRefusal(finance: ClubFinance, monthlyWageBill: number, cost: DealCost): string | null {
  if (cost.upFront > finance.transferBudget) return "transferBudget";
  if (cost.wageChange > 0 && monthlyWageBill + cost.wageChange > finance.wageCap) return "wageCap";
  return null;
}
