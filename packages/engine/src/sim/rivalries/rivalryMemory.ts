import type { GameState, IsoDate } from "../gameState.js";

/**
 * Two coaches' record against each other (`a` and `b` as in their pair key): their meetings, each one's
 * wins and the draws, the finals among them, the press clashes between them and the day they last met.
 */
export type CoachRivalry = { a: string; b: string; meetings: number; aWins: number; bWins: number; draws: number; finals: number; clashes: number; lastMet: IsoDate };

/**
 * What the game remembers of rivalries between people: each pair of coaches with a human among them
 * (keys from `coachKeyOf`, the pair as `pairKeyOf` writes it), and the derbies each human coach won
 * per club. A save from before rivalries has none.
 */
export type RivalryMemory = { coaches: Record<string, CoachRivalry>; derbyWins: Record<string, Record<string, number>> };

const NO_RIVALRIES: RivalryMemory = { coaches: {}, derbyWins: {} };

export const rivalryMemoryOf = (state: Pick<GameState, "rivalries">): RivalryMemory => state.rivalries ?? NO_RIVALRIES;

/** A pair of coach keys in a fixed order, so either side finds the same record. */
export const pairKeyOf = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** The derbies a human coach (by `humanKey`) won at a club. */
export const derbyWinsOf = (state: Pick<GameState, "rivalries">, coachKey: string, clubId: string): number => rivalryMemoryOf(state).derbyWins[coachKey]?.[clubId] ?? 0;
