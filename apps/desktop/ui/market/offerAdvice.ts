import { pickLineup } from "@boleiro/engine/engine/match";
import type { GameState, SimPlayer } from "@boleiro/engine/sim/gameState";
import type { MarketRow } from "./marketSearch.js";

type AdviceState = Pick<GameState, "coachClubId" | "players" | "finances">;

/** What the assistant says about an offer: whether it fits the money, and where the player would stand in the squad. */
export type OfferAdvice = {
  /** Transfer budget left after the fee and the three months of wages the board sets aside; negative when short. */
  budgetLeft: number;
  /** The coach's players at his position, strongest first. */
  atPosition: Pick<SimPlayer, "id" | "name" | "strength" | "age">[];
  /** The weakest of the coach's starters at his position, whom he would replace; null when he would not start. */
  replaces: Pick<SimPlayer, "name" | "strength"> | null;
  squadSize: number;
};

// The board budgets a signing's fee plus three months of his wage (decideCoachRequest.ts).
const WAGE_MONTHS_UP_FRONT = 3;
const SHOWN_AT_POSITION = 3;

export function offerAdvice(state: AdviceState, row: Pick<MarketRow, "group" | "strength">, fee: number, wage: number): OfferAdvice {
  const squad = Object.values(state.players).filter((p) => p.clubId === state.coachClubId);
  const budget = state.coachClubId ? (state.finances[state.coachClubId]?.transferBudget ?? 0) : 0;
  const atPosition = squad
    .filter((p) => p.group === row.group)
    .sort((a, b) => b.strength - a.strength)
    .slice(0, SHOWN_AT_POSITION)
    .map(({ id, name, strength, age }) => ({ id, name, strength, age }));
  const starters = pickLineup([...squad]).filter((p) => p.group === row.group);
  const weakest = starters.reduce<SimPlayer | null>((low, p) => (low === null || p.strength < low.strength ? p : low), null);
  return {
    budgetLeft: budget - fee - WAGE_MONTHS_UP_FRONT * wage,
    atPosition,
    replaces: weakest && weakest.strength < row.strength ? { name: weakest.name, strength: weakest.strength } : null,
    squadSize: squad.length,
  };
}
