import { dropCoachFriendlies } from "../friendlies/friendlies.js";
import { releaseTicketPrice } from "../finances/setTicketPrice.js";
import type { GameState } from "../gameState.js";
import { openMoments } from "./runMoments.js";

/**
 * The coach in the seat hangs up his clipboard: he leaves his club, if he has one, without a contract or
 * offers, and no club calls him again. His farewell waits at the head of his moments: the career replayed.
 */
export function retireCoach(state: GameState): GameState {
  const { coach, history, date, coachClubId } = state;
  if (coach.retiredOn) throw new Error("the coach has already retired");
  const record = history.coach;
  const lastClubId = coachClubId ?? record.stints.at(-1)?.clubId;
  if (!lastClubId) throw new Error("a coach who never ran a club has no career to retire from");
  const stints = record.stints.map((stint, index) => (index === record.stints.length - 1 && stint.until === null ? { ...stint, until: date, left: "retired" as const } : stint));
  const moments = record.moments ?? openMoments(state, { name: state.coachName, record });
  const closedStints = stints.filter((stint) => stint.until !== null).length;
  const farewell = { id: `retirement:${date}`, kind: "retirement" as const, date, clubId: lastClubId };
  const board = coachClubId ? state.boards[coachClubId] : undefined;
  let retired: GameState = {
    ...state,
    coachClubId: null,
    coach: { ...coach, contract: null, offers: [], retiredOn: date },
    history: { ...history, coach: { ...record, stints, moments: { ...moments, seen: { ...moments.seen, closedStints }, queue: [farewell, ...moments.queue], shownOn: null } } },
  };
  if (!coachClubId) return retired;
  retired = {
    ...retired,
    boards: board ? { ...state.boards, [coachClubId]: { ...board, games: 0, pressure: 0 } } : state.boards,
    ...(state.coaches ? { coaches: { ...state.coaches, openJobs: { ...state.coaches.openJobs, [coachClubId]: date } } } : {}),
  };
  return releaseTicketPrice(dropCoachFriendlies(retired, coachClubId), coachClubId);
}
