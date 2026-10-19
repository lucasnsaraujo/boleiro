import type { GameState } from "../gameState.js";
import type { CoachRecord } from "../history/history.js";
import type { CoachMarket } from "../transfers/transferMarket.js";
import type { NationalJob, NationalOffer } from "../nations/nations.js";
import type { Coach } from "./coach.js";

/**
 * A human coach of a hot-seat game waiting for his turn: everything the game keeps for the coach in
 * the seat (`coachClubId`, `coach`, `market.coach`, `history.coach`, and his national team's job,
 * offer and call-up in `nations`), kept aside until he sits down.
 */
export type WaitingCoach = {
  name: string;
  clubId: string | null;
  coach: Coach;
  market?: CoachMarket;
  record: CoachRecord;
  nationalJob?: NationalJob;
  nationalOffer?: NationalOffer;
  nationalPicks?: string[];
};

/**
 * A coach's name as a new game tells coaches apart: without case, accents or spaces, so "Ana Lúcia" and
 * "analucia" can't sit at one table, the second being too easy to take for the first. Everything a coach
 * keeps is filed under his exact name (humanKey), so a save from before this rule still loads: coaches in it
 * with exactly the same name share one key and count as one coach in the rankings, derbies and records.
 */
export const coachNameKey = (name: string): string => name.normalize("NFD").replace(/\p{M}|\s/gu, "").toLowerCase();

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
  const { coachClubId: clubId, coach, market, history, nations } = state;
  return {
    name: state.coachName ?? "",
    clubId,
    coach,
    ...(market.coach ? { market: market.coach } : {}),
    record: history.coach,
    ...(nations?.job ? { nationalJob: nations.job } : {}),
    ...(nations?.offer ? { nationalOffer: nations.offer } : {}),
    ...(nations?.picks ? { nationalPicks: nations.picks } : {}),
  };
}

/** National football with `coach`'s job, offer and call-up in the seat's place; the same object when neither he nor the one leaving has any. */
function seatedNations(nations: GameState["nations"], coach: WaitingCoach): GameState["nations"] {
  if (!nations || (!nations.job && !nations.offer && !nations.picks && !coach.nationalJob && !coach.nationalOffer && !coach.nationalPicks)) return nations;
  const next = { ...nations };
  delete next.job;
  delete next.offer;
  delete next.picks;
  return { ...next, ...(coach.nationalJob ? { job: coach.nationalJob } : {}), ...(coach.nationalOffer ? { offer: coach.nationalOffer } : {}), ...(coach.nationalPicks ? { picks: coach.nationalPicks } : {}) };
}

function seat(state: GameState, coach: WaitingCoach, waitingCoaches: WaitingCoach[]): GameState {
  const market = { ...state.market };
  if (coach.market) market.coach = coach.market;
  else Reflect.deleteProperty(market, "coach");
  const nations = seatedNations(state.nations, coach);
  return {
    ...state,
    coachName: coach.name,
    coachClubId: coach.clubId,
    coach: coach.coach,
    market,
    history: { ...state.history, coach: coach.record },
    waitingCoaches,
    ...(nations ? { nations } : {}),
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
