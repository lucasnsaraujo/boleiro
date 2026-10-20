import { finishMatchDay } from "./live/finishMatchDay.js";
import { startMatchDay } from "./live/startMatchDay.js";
/** One day of the game: today's matches with no live changes, then everything else the day brings. */
export function advanceDay(state, decisions) {
    return finishMatchDay(startMatchDay(state, decisions));
}
