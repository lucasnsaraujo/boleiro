import { dropCoachFriendlies } from "../friendlies/friendlies.js";
import { releaseTicketPrice } from "../finances/setTicketPrice.js";
import type { GameState } from "../gameState.js";

// guess: walking out costs the coach a couple of reputation points, less than a firing.
export const RESIGN_REPUTATION_COST = 2;
// guess: the club he walked out on won't hire him again until two seasons after this one are over.
export const RESIGN_COOLDOWN_SEASONS = 2;

/**
 * The coach in the seat walks out on his club: no club and no contract, a little less wanted, the
 * resignation in his record, and his old club won't hire him back for a while. The club's board starts
 * over and its job opens for the AI coaches. His open offers stay on the table.
 */
export function resign(state: GameState): GameState {
  const clubId = state.coachClubId;
  if (!clubId) throw new Error("a coach without a club has nothing to resign from");
  const { coach, history, date, season } = state;
  const cooldowns = [...(coach.cooldowns ?? []).filter((cooldown) => cooldown.clubId !== clubId), { clubId, untilSeason: season + RESIGN_COOLDOWN_SEASONS }];
  const record = history.coach;
  const stints = record.stints.map((stint, index) => (index === record.stints.length - 1 && stint.until === null ? { ...stint, until: date, left: "resigned" as const } : stint));
  const board = state.boards[clubId];
  const left: GameState = {
    ...state,
    coachClubId: null,
    coach: { ...coach, contract: null, reputation: Math.max(0, coach.reputation - RESIGN_REPUTATION_COST), cooldowns },
    history: { ...history, coach: { ...record, stints, resignations: [...(record.resignations ?? []), { clubId, date }] } },
    boards: board ? { ...state.boards, [clubId]: { ...board, games: 0, pressure: 0 } } : state.boards,
    ...(state.coaches ? { coaches: { ...state.coaches, openJobs: { ...state.coaches.openJobs, [clubId]: date } } } : {}),
  };
  return releaseTicketPrice(dropCoachFriendlies(left, clubId), clubId);
}
