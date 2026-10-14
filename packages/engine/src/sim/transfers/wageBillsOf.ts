import type { GameState } from "../gameState.js";

/** Each club's monthly wage bill in BRL; a loaned player's wage is split with the club that lent him. */
export function wageBillsOf(state: Pick<GameState, "players" | "market">): Map<string, number> {
  const bills = new Map<string, number>();
  for (const player of Object.values(state.players)) bills.set(player.clubId, (bills.get(player.clubId) ?? 0) + player.wage);
  return splitLoanWages(state, bills);
}

/**
 * Moves the lender's share of each loaned player's wage from the borrower's bill to the lender's, in
 * `bills` holding every player's full wage at his club. Loans are few, so this beats a lookup per player.
 */
export function splitLoanWages(state: Pick<GameState, "players" | "market">, bills: Map<string, number>): Map<string, number> {
  const add = (clubId: string, amount: number) => bills.set(clubId, (bills.get(clubId) ?? 0) + amount);
  for (const [id, loan] of Object.entries(state.market.loans)) {
    const player = state.players[id];
    const lenderShare = player ? Math.round(player.wage * loan.lenderWageShare) : 0;
    if (!player || !lenderShare) continue;
    add(player.clubId, -lenderShare);
    add(loan.fromClubId, lenderShare);
  }
  return bills;
}
