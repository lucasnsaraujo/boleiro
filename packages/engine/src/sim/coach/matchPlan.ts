import type { GameState } from "../gameState.js";
import { waitingCoachesOf } from "./humanCoaches.js";
import type { Tactics } from "./tactics.js";

/** A substitution the coach planned for a set minute of his matches. */
export type MinuteSub = { minute: number; offId: string; onId: string };

/**
 * What a coach lets his matches do without stopping. Every rule is off when left out, so a coach who
 * never set a plan (or a save from before plans) plays as the game always did: every red card and injury
 * asks him in a window.
 */
export type MatchPlan = {
  /** On a red card or an injury, the side keeps its shape line by line (planSubstitutions.ts). */
  keepsShape?: true;
  /** Who comes on for a player, by the player's id, when he is hurt or tired, or when he is sent off and his line needs a man. */
  namedSubs?: Record<string, string>;
  /** A player whose energy in the match falls below this percentage comes off. */
  energyFloor?: number;
  /** Substitutions at set minutes. */
  minuteSubs?: MinuteSub[];
  /** The order his side kicks a shootout in; left out, strongest first. */
  kickerOrder?: string[];
  /** True to be asked the order before his side's shootout; left out, it is kicked in `kickerOrder` without asking, as the game always did. */
  asksBeforeShootout?: true;
  /** Tactics he keeps ready, cycled in the live round by `tacticsKey`. */
  savedTactics?: Tactics[];
  /** The key that moves his side to the next saved tactics in the live round. */
  tacticsKey?: string;
  /** The key that stops the round and opens his own match. */
  timeOutKey?: string;
};

export const MAX_SAVED_TACTICS = 4;
/** An energy floor below this would never take anyone off before the last minutes; above it, half the side at half-time. */
export const ENERGY_FLOOR_RANGE = { min: 30, max: 80 } as const;
const PLANNED_MINUTES = { first: 1, last: 89 } as const;
const MOST_MINUTE_SUBS = 5;
const PLAN_KEY = /^[a-z0-9]$/;

/** The match plan of the human coach who runs `clubId`, in the seat or waiting; none for an AI club or a coach who never set one. */
export function planOfClub(state: Pick<GameState, "coachClubId" | "coach" | "waitingCoaches">, clubId: string): MatchPlan | undefined {
  if (clubId === state.coachClubId) return state.coach.matchPlan;
  return waitingCoachesOf(state).find((waiting) => waiting.clubId === clubId)?.coach.matchPlan;
}

/** The coach's plan in the seat; an empty one when he never set it. */
export const matchPlanOf = (state: Pick<GameState, "coach">): MatchPlan => state.coach.matchPlan ?? {};

/** The keys a plan takes on the shared keyboard. */
export const planKeysOf = (plan: MatchPlan): string[] => [plan.tacticsKey, plan.timeOutKey].filter((key): key is string => key !== undefined);

/** Every key the other human coaches' plans take, with whose it is: in a hot-seat game they share one keyboard. */
export function keysTakenByOthers(state: Pick<GameState, "waitingCoaches">): { key: string; coachName: string }[] {
  return waitingCoachesOf(state).flatMap((waiting) => planKeysOf(waiting.coach.matchPlan ?? {}).map((key) => ({ key, coachName: waiting.name })));
}

/** Why a plan can't be kept, or null when it can: a key taken twice or by another coach, or a rule out of range. */
export function matchPlanProblem(state: Pick<GameState, "waitingCoaches">, plan: MatchPlan): string | null {
  for (const key of planKeysOf(plan)) if (!PLAN_KEY.test(key)) return `key "${key}" must be one lowercase letter or digit`;
  if (plan.tacticsKey !== undefined && plan.tacticsKey === plan.timeOutKey) return `key "${plan.tacticsKey}" can't both change tactics and call a time-out`;
  for (const { key, coachName } of keysTakenByOthers(state)) if (planKeysOf(plan).includes(key)) return `key "${key}" is ${coachName}'s`;
  const floor = plan.energyFloor;
  if (floor !== undefined && (!Number.isInteger(floor) || floor < ENERGY_FLOOR_RANGE.min || floor > ENERGY_FLOOR_RANGE.max)) {
    return `the energy floor must be a whole number from ${ENERGY_FLOOR_RANGE.min} to ${ENERGY_FLOOR_RANGE.max}`;
  }
  const subs = plan.minuteSubs ?? [];
  if (subs.length > MOST_MINUTE_SUBS) return `at most ${MOST_MINUTE_SUBS} planned substitutions`;
  for (const sub of subs) {
    if (!Number.isInteger(sub.minute) || sub.minute < PLANNED_MINUTES.first || sub.minute > PLANNED_MINUTES.last) return `a planned substitution comes from minute ${PLANNED_MINUTES.first} to ${PLANNED_MINUTES.last}`;
    if (sub.offId === sub.onId) return "a planned substitution needs two players";
  }
  for (const [playerId, subId] of Object.entries(plan.namedSubs ?? {})) if (playerId === subId) return "a player can't be his own substitute";
  if ((plan.savedTactics?.length ?? 0) > MAX_SAVED_TACTICS) return `at most ${MAX_SAVED_TACTICS} saved tactics`;
  return null;
}

/** The game with the seated coach's plan replaced; throws when it can't be kept (matchPlanProblem). */
export function withMatchPlan(state: GameState, plan: MatchPlan): GameState {
  const problem = matchPlanProblem(state, plan);
  if (problem) throw new Error(problem);
  const coach = { ...state.coach };
  if (Object.keys(plan).length) coach.matchPlan = plan;
  else delete coach.matchPlan;
  return { ...state, coach };
}
