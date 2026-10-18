import { loadNationalFootball } from "@boleiro/data/nationalFootball";
import { advanceDay } from "../sim/advanceDay.js";
import type { IsoDate } from "../sim/gameState.js";
import { loadNewGame } from "../sim/loadNewGame.js";
import { fifaWindowsOf } from "../sim/nations/fifaCalendar.js";

/** One FIFA window's call-ups of the game's players: all of them, those from Série A, and those of them kept on for a final tournament after it. */
export type WindowCallUps = { from: IsoDate; called: number; serieA: number; serieAToTournament: number };

/** Plays `seasons` whole seasons of a game with national football and no coach, and counts the call-ups of every FIFA window. */
export function callUpsBySeason(seed: number, seasons: number): WindowCallUps[] {
  let state = loadNewGame(seed, { coachClubId: null, nationalFootball: loadNationalFootball() });
  const windows: WindowCallUps[] = [];
  const lastSeason = state.season + seasons - 1;
  while (state.season <= lastSeason) {
    const before = state;
    const day = advanceDay(state, {});
    state = day.state;
    // The call-ups come with the day before a window, as its first day starts.
    const window = fifaWindowsOf(state.season).find((w) => w.from === state.date);
    if (!window) continue;
    const called = day.events.flatMap((e) => (e.type === "calledUp" ? [e] : []));
    const fromSerieA = called.filter((e) => before.clubs[e.clubId]?.division === "A");
    windows.push({ from: before.date, called: called.length, serieA: fromSerieA.length, serieAToTournament: fromSerieA.filter((e) => e.until > window.until).length });
  }
  return windows;
}
