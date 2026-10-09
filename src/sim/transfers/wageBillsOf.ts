import type { GameState } from "../gameState.js";

/** Each club's monthly wage bill in BRL; a loaned player's wage is split with the club that lent him. */
export function wageBillsOf(state: Pick<GameState, "players" | "market">): Map<string, number> {
  const bills = new Map<string, number>();
  const add = (clubId: string, amount: number) => bills.set(clubId, (bills.get(clubId) ?? 0) + amount);
  for (const player of Object.values(state.players)) add(player.clubId, player.wage);
  // Loans are few, so they are settled after the full pass instead of looked up for every player.
  for (const [id, loan] of Object.entries(state.market.loans)) {
    const player = state.players[id];
    const lenderShare = player ? Math.round(player.wage * loan.lenderWageShare) : 0;
    if (!player || !lenderShare) continue;
    add(player.clubId, -lenderShare);
    add(loan.fromClubId, lenderShare);
  }
  return bills;
}
