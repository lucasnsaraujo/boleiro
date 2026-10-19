import type { ClubFinance, CostLine, GameState, RevenueLine } from "../gameState.js";

type MoneyEntry = { revenue: RevenueLine; amount: number } | { cost: CostLine; amount: number };

/** Moves cash now and books it in the club's current month. Positive amounts are revenue or costs, never negative. */
export function bookMoney(state: GameState, clubId: string, entry: MoneyEntry): GameState {
  const finances = { ...state.finances };
  bookMoneyInDraft(finances, clubId, entry);
  return { ...state, finances };
}

/**
 * bookMoney on a finances map the caller has just copied and still owns: the map is changed in
 * place, so a run of bookings costs one copy of the map instead of one per booking.
 */
export function bookMoneyInDraft(finances: Record<string, ClubFinance>, clubId: string, entry: MoneyEntry): void {
  const finance = finances[clubId];
  if (!finance) throw new Error(`no finances for ${clubId}`);
  if (entry.amount < 0) throw new Error(`${clubId}: cannot book a negative amount`);
  const { month } = finance;
  finances[clubId] =
    "revenue" in entry
      ? { ...finance, cash: finance.cash + entry.amount, month: { ...month, revenue: { ...month.revenue, [entry.revenue]: month.revenue[entry.revenue] + entry.amount } } }
      : { ...finance, cash: finance.cash - entry.amount, month: { ...month, costs: { ...month.costs, [entry.cost]: month.costs[entry.cost] + entry.amount } } };
}
