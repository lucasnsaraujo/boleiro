import type { GameState } from "../gameState.js";
import { personalWindowEnd } from "../transfers/transferWindows.js";
import type { Coach } from "./coach.js";
import { countryOfWorldClub, joinFullTier } from "../world/joinFullTier.js";

export type CoachHired = { type: "coachHired"; clubId: string; salary: number; untilSeason: number };

/** The coach with his own window when he moves outside the game's windows or near a window's end, and without an old one otherwise. */
function withPersonalWindow(state: GameState, coach: Coach): Coach {
  const until = personalWindowEnd(state, state.date);
  if (until) return { ...coach, personalWindowUntil: until };
  const rest = { ...coach };
  Reflect.deleteProperty(rest, "personalWindowUntil");
  return rest;
}

/**
 * The player's coach takes an open offer: he moves to the club, which gives the new man a clean slate,
 * and outside the game's windows, or in a window's last days, a short window of his own to rebuild the squad.
 * A club abroad played result-only brings its country into the full tier first (joinFullTier).
 */
export function acceptOffer(before: GameState, clubId: string): { state: GameState; event: CoachHired } {
  const offer = before.coach.offers.find((o) => o.clubId === clubId);
  if (!offer) throw new Error(`no open offer from ${clubId}`);
  // A club abroad played result-only brings its country into the full tier with the coach.
  const abroad = countryOfWorldClub(before, clubId);
  const state = abroad ? joinFullTier(before, abroad.id) : before;
  const board = state.boards[clubId];
  const boards = board ? { ...state.boards, [clubId]: { ...board, games: 0, pressure: 0 } } : state.boards;
  const contract = { salary: offer.salary, untilSeason: offer.untilSeason };
  return {
    state: { ...state, coachClubId: clubId, boards, coach: withPersonalWindow(state, { ...state.coach, contract, offers: [] }) },
    event: { type: "coachHired", clubId, ...contract },
  };
}
