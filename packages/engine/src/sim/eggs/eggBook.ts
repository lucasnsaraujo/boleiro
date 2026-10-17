import type { GameState, IsoDate } from "../gameState.js";
import type { EggLook } from "./eggType.js";

/** One egg a human coach's club found: the day, the match it came from and the player it is about, when it has them. */
export type EggFind = { eggId: string; date: IsoDate; clubId: string; fixtureId?: string; playerId?: string; headline: string };

/**
 * The career's eggs, oldest first. `coachName` is the coach's name in a one-coach game, which the game
 * keeps nowhere else, for the kids the academy names after him.
 */
export type EggBook = { log: EggFind[]; coachName?: string };

/** An egg a human coach's club found today, as the day's news tells it. */
export type EggFound = { type: "eggFound"; eggId: string; clubId: string; title: string; look: EggLook; headline: string; body: string };

const EMPTY_BOOK: EggBook = { log: [] };

/** The game's egg book; a save from before eggs has an empty one. */
export const eggBookOf = (state: Pick<GameState, "eggs">): EggBook => state.eggs ?? EMPTY_BOOK;

/** The finds of a match, oldest first. */
export const eggsOfMatch = (state: Pick<GameState, "eggs">, fixtureId: string): EggFind[] => eggBookOf(state).log.filter((find) => find.fixtureId === fixtureId);
