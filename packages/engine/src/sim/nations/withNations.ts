import type { NationalFootball } from "@boleiro/data/nationalFootball";
import { addDays } from "../dates.js";
import type { GameState } from "../gameState.js";
import { nationsDay } from "./nationsDay.js";
import { openNations } from "./openNations.js";

/**
 * A game saved before national football, with it: opened from its seed on 1 January of its season and played
 * result-only up to its day, as a new game would have, its clubs' players left as the save has them. A call-up
 * still running on that day keeps its players away until it ends. A game that has national football, or files
 * without the national packs, stays as it is.
 */
export function withNations(state: GameState, football: NationalFootball | undefined): GameState {
  if (state.nations || !football) return state;
  let nations = openNations(football, state, state.season, state.seed);
  for (let day = `${state.season}-01-01`; day < state.date; day = addDays(day, 1)) {
    nations = nationsDay({ ...state, date: addDays(day, 1), nations }, day).state.nations ?? nations;
  }
  return { ...state, nations };
}
