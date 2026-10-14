import type { GameState } from "../gameState.js";

export type CoachHired = { type: "coachHired"; clubId: string; salary: number; untilSeason: number };

/** The player's coach takes an open offer: he moves to the club, which gives the new man a clean slate. */
export function acceptOffer(state: GameState, clubId: string): { state: GameState; event: CoachHired } {
  const offer = state.coach.offers.find((o) => o.clubId === clubId);
  if (!offer) throw new Error(`no open offer from ${clubId}`);
  const board = state.boards[clubId];
  const boards = board ? { ...state.boards, [clubId]: { ...board, games: 0, pressure: 0 } } : state.boards;
  const contract = { salary: offer.salary, untilSeason: offer.untilSeason };
  return {
    state: { ...state, coachClubId: clubId, boards, coach: { ...state.coach, contract, offers: [] } },
    event: { type: "coachHired", clubId, ...contract },
  };
}
