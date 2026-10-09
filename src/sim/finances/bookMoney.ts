import type { ClubFinance, CostLine, GameState, RevenueLine } from "../gameState.js";

/** Moves cash now and books it in the club's current month. Positive amounts are revenue or costs, never negative. */
export function bookMoney(
  state: GameState,
  clubId: string,
  entry: { revenue: RevenueLine; amount: number } | { cost: CostLine; amount: number },
): GameState {
  const finance = state.finances[clubId];
  if (!finance) throw new Error(`no finances for ${clubId}`);
  if (entry.amount < 0) throw new Error(`${clubId}: cannot book a negative amount`);
  const { month } = finance;
  const booked: ClubFinance =
    "revenue" in entry
      ? { ...finance, cash: finance.cash + entry.amount, month: { ...month, revenue: { ...month.revenue, [entry.revenue]: month.revenue[entry.revenue] + entry.amount } } }
      : { ...finance, cash: finance.cash - entry.amount, month: { ...month, costs: { ...month.costs, [entry.cost]: month.costs[entry.cost] + entry.amount } } };
  return { ...state, finances: { ...state.finances, [clubId]: booked } };
}
