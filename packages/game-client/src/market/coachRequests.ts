import { pickLineup } from "@boleiro/engine/engine/match";
import { tierOf } from "@boleiro/engine/sim/finances/tierOf";
import type { GameState, SimPlayer, Tier } from "@boleiro/engine/sim/gameState";
import type { CoachRequest } from "@boleiro/engine/sim/transfers/coachRequest";
import { LOAN_MAX_AGE } from "@boleiro/engine/sim/transfers/loans";
import { isInPreContractWindow } from "@boleiro/engine/sim/transfers/tradeBetweenClubs";

export type RequestOption = { label: string; request: CoachRequest };
export type RequestState = Pick<GameState, "date" | "coachClubId" | "clubs" | "players" | "market">;

// guess: a renewal the coach doesn't size runs two more seasons.
export const DEFAULT_RENEWAL_YEARS = 2;

const RANK: Record<Tier, number> = { A: 4, B: 3, C: 2, D: 1, state: 0 };

const tierOfClub = (state: Pick<GameState, "clubs">, clubId: string): Tier => tierOf(state.clubs[clubId] ?? { division: null });

/** A player at a club, on a free transfer, or nowhere. */
export function findPlayer(state: Pick<GameState, "players" | "market">, playerId: string): SimPlayer | null {
  return state.players[playerId] ?? state.market.freeAgents[playerId] ?? null;
}

/** Whether a bigger club would lend him: the board refuses when the lender is no bigger or he is in its best eleven. */
export function isLendable(state: Pick<GameState, "coachClubId" | "clubs" | "players">, player: SimPlayer, lineupOf: (clubId: string) => readonly SimPlayer[]): boolean {
  if (!state.coachClubId || RANK[tierOfClub(state, player.clubId)] <= RANK[tierOfClub(state, state.coachClubId)]) return false;
  return !lineupOf(player.clubId).some((p) => p.id === player.id);
}

export function lineupsOf(players: GameState["players"]): (clubId: string) => readonly SimPlayer[] {
  const cache = new Map<string, SimPlayer[]>();
  return (clubId) => {
    let lineup = cache.get(clubId);
    if (!lineup) {
      lineup = pickLineup(Object.values(players).filter((p) => p.clubId === clubId));
      cache.set(clubId, lineup);
    }
    return lineup;
  };
}

/** What the coach can ask the board about one player, the usual request first. */
export function requestOptions(state: RequestState, playerId: string, years = DEFAULT_RENEWAL_YEARS, lineupOf = lineupsOf(state.players)): RequestOption[] {
  const { coachClubId, market } = state;
  if (!coachClubId) return [];
  if (market.freeAgents[playerId]) return [{ label: "Contratar", request: { kind: "sign", playerId } }];
  const player = state.players[playerId];
  if (!player) return [];
  const loan = market.loans[playerId];
  if (loan?.fromClubId === coachClubId) return [{ label: "Chamar de volta", request: { kind: "recall", playerId } }];
  // A loanee here can only be bought, through his purchase clause.
  if (loan) return player.clubId === coachClubId && loan.buyOption !== null ? [{ label: "Comprar", request: { kind: "sign", playerId } }] : [];
  if (player.clubId === coachClubId) {
    // The board refuses to renew a player who already signed a pre-contract elsewhere.
    const renew: RequestOption[] = market.preContracts[playerId] ? [] : [{ label: "Renovar", request: { kind: "renew", playerId, years } }];
    const own: RequestOption[] = [...renew, { label: "Vender", request: { kind: "sell", playerId } }];
    return player.age <= LOAN_MAX_AGE ? [...own, { label: "Emprestar", request: { kind: "loanOut", playerId } }] : own;
  }
  if (market.preContracts[playerId]) return [];
  if (isInPreContractWindow(player, state.date)) return [{ label: "Pré-contrato", request: { kind: "sign", playerId } }];
  const buy: RequestOption = { label: "Comprar", request: { kind: "sign", playerId } };
  return isLendable(state, player, lineupOf) ? [buy, { label: "Pedir empréstimo", request: { kind: "loanIn", playerId } }] : [buy];
}

/** The request to pay his release clause, for a player under contract at another club whom nobody else holds; null otherwise. */
export function clauseRequest(state: RequestState, playerId: string): CoachRequest | null {
  const player = state.players[playerId];
  if (!state.coachClubId || !player || player.clubId === state.coachClubId) return null;
  if (state.market.loans[playerId] || state.market.preContracts[playerId]) return null;
  return { kind: "payClause", playerId };
}

/** Whether the board can only grant it inside a transfer window. Free agents, pre-contracts and renewals go any day. */
export function needsWindow(state: Pick<GameState, "date" | "coachClubId" | "players" | "market">, request: CoachRequest): boolean {
  if (request.kind === "renew") return false;
  if (request.kind !== "sign") return true;
  const player = state.players[request.playerId];
  if (!player || isInPreContractWindow(player, state.date)) return false;
  // A loanee's purchase clause is triggered at any time.
  return !(player.clubId === state.coachClubId && state.market.loans[player.id]);
}
