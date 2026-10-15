import type { DayEvent } from "../advanceDay.js";
import type { GameState } from "../gameState.js";
import type { CoachRecord, CoachStint, History } from "./history.js";
import { recordTransfer } from "./recordTransfer.js";
import { transfersOf } from "./transfersOf.js";

function closeStint(stints: CoachStint[], date: string, left: NonNullable<CoachStint["left"]>): CoachStint[] {
  const last = stints.at(-1);
  return last && last.until === null ? [...stints.slice(0, -1), { ...last, until: date, left }] : stints;
}

function recordCoach(coach: CoachRecord, event: DayEvent, date: string): CoachRecord {
  switch (event.type) {
    case "coachHired":
      return { ...coach, stints: [...closeStint(coach.stints, date, "moved"), { clubId: event.clubId, from: date, until: null, left: null }] };
    case "coachFired":
      if (!event.isYou) return coach;
      return {
        ...coach,
        stints: closeStint(coach.stints, date, "fired"),
        firings: [...coach.firings, { clubId: event.clubId, date, position: event.position, targetPosition: event.targetPosition }],
      };
    case "contractEnded":
      return { ...coach, stints: closeStint(coach.stints, date, "contractEnded") };
    case "coachSeasonReviewed":
      return { ...coach, seasons: [...coach.seasons, { season: event.season, clubId: event.clubId, position: event.position, targetPosition: event.targetPosition }] };
    default:
      return coach;
  }
}

/**
 * Writes the day's transfers and the player's coach career into the history. `before` is the state the
 * day started from: it still knows the players who were sold abroad today.
 */
export function recordDayEvents(state: GameState, events: readonly DayEvent[], before: GameState): GameState {
  let history: History = state.history;
  for (const { fromId, ...transfer } of transfersOf(events, before)) {
    // Signings from abroad have no seller to credit.
    if (fromId) history = recordTransfer(history, { ...transfer, fromId });
  }
  history = recordedCoach(history, events, before.date);
  return history === state.history ? state : { ...state, history };
}

function recordedCoach(history: History, events: readonly DayEvent[], date: string): History {
  let next = history;
  for (const event of events) {
    const coach = recordCoach(next.coach, event, date);
    if (coach !== next.coach) next = { ...next, coach };
  }
  return next;
}

/** Writes the career events of the coach in the seat into his record, as of `date`, the day they happened. */
export function recordCoachEvents(state: GameState, events: readonly DayEvent[], date: string): GameState {
  const history = recordedCoach(state.history, events, date);
  return history === state.history ? state : { ...state, history };
}
