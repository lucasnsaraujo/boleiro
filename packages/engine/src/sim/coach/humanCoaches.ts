import type { GameState } from "../gameState.js";
import type { CoachRecord } from "../history/history.js";
import type { CoachMarket } from "../transfers/transferMarket.js";
import type { Coach } from "./coach.js";

/**
 * A human coach of a hot-seat game waiting for his turn: everything the game keeps for the coach in
 * the seat (`coachClubId`, `coach`, `market.coach`, `history.coach`), kept aside until he sits down.
 */
export type WaitingCoach = {
  name: string;
  clubId: string | null;
  coach: Coach;
  market?: CoachMarket;
  record: CoachRecord;
};

/** The human coaches who are not in the seat, in turn order after him; a one-coach game has none. */
export const waitingCoachesOf = (state: Pick<GameState, "waitingCoaches">): readonly WaitingCoach[] => state.waitingCoaches ?? [];

/** Whether a human coach runs the club, in the seat or waiting; every other club is the AI's. */
export function isHumanClub(state: Pick<GameState, "coachClubId" | "waitingCoaches">, clubId: string): boolean {
  return clubId === state.coachClubId || (state.waitingCoaches?.some((coach) => coach.clubId === clubId) ?? false);
}

/** The clubs every human coach runs, the one in the seat first. */
export function humanClubIds(state: Pick<GameState, "coachClubId" | "waitingCoaches">): string[] {
  return [state.coachClubId, ...waitingCoachesOf(state).map((coach) => coach.clubId)].filter((id): id is string => id !== null);
}

function seatedOf(state: GameState): WaitingCoach {
  const { coachClubId: clubId, coach, market, history } = state;
  return { name: state.coachName ?? "", clubId, coach, ...(market.coach ? { market: market.coach } : {}), record: history.coach };
}

function seat(state: GameState, coach: WaitingCoach, waitingCoaches: WaitingCoach[]): GameState {
  const market = { ...state.market };
  if (coach.market) market.coach = coach.market;
  else Reflect.deleteProperty(market, "coach");
  return {
    ...state,
    coachName: coach.name,
    coachClubId: coach.clubId,
    coach: coach.coach,
    market,
    history: { ...state.history, coach: coach.record },
    waitingCoaches,
  };
}

/** The game with the next coach in turn order in the seat and the one who was there last in line. */
export function passTheSeat(state: GameState): GameState {
  const [next, ...rest] = waitingCoachesOf(state);
  if (!next) return state;
  return seat(state, next, [...rest, seatedOf(state)]);
}

/** Swaps the coach in the seat with the waiting coach at `index`; swapping twice puts both back. */
export function swapSeat(state: GameState, index: number): GameState {
  const waiting = [...waitingCoachesOf(state)];
  const coach = waiting[index];
  if (!coach) throw new Error(`no waiting coach ${index}`);
  waiting[index] = seatedOf(state);
  return seat(state, coach, waiting);
}

/**
 * Runs a coach's own part of the day for the waiting coach at `index`, as if he sat in the seat,
 * and puts the coach in the seat back afterwards.
 */
export function asWaitingCoach<T extends { state: GameState }>(state: GameState, index: number, step: (seated: GameState) => T): T {
  const done = step(swapSeat(state, index));
  return { ...done, state: swapSeat(done.state, index) };
}
