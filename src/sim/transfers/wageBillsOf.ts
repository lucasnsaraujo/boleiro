import type { GameState } from "../gameState.js";

/** Each club's monthly wage bill in BRL; a loaned player's wage is split with the club that lent him. */
export function wageBillsOf(state: Pick<GameState, "players" | "market">): Map<string, number> {
  const bills = new Map<string, number>();
  const add = (clubId: string, amount: number) => bills.set(clubId, (bills.get(clubId) ?? 0) + amount);
  for (const player of Object.values(state.players)) {
    const loan = state.market.loans[player.id];
    const lenderShare = loan ? Math.round(player.wage * loan.lenderWageShare) : 0;
    add(player.clubId, player.wage - lenderShare);
    if (loan && lenderShare) add(loan.fromClubId, lenderShare);
  }
  return bills;
}
