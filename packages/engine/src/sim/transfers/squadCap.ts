import type { GameState } from "../gameState.js";

// The CBF lets a Série A club register up to 50 players in 2026 (press reports of the rules, e.g. SBT
// News, 22 Sep 2026: "O número total de atletas inscritos continuará sendo de 50 jogadores"); Boleiro
// holds every club to it, in every division. No club signs, borrows or takes a player from abroad while
// it has 50, counting players with a pre-contract who join it when their contracts end. A club that
// gets above it keeps its players and must lose some before it can sign again.
export const SQUAD_CAP = 50;

/** Whether a squad of this size can't register one more player. */
export const isSquadFull = (size: number): boolean => size >= SQUAD_CAP;

/** Whether a club with `squadSize` players can't register one more, counting those due to join it on pre-contracts. */
export function isClubFull(state: GameState, clubId: string, squadSize: number): boolean {
  let joining = 0;
  for (const toClubId of Object.values(state.market.preContracts)) if (toClubId === clubId) joining++;
  return isSquadFull(squadSize + joining);
}
