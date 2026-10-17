import { describe, expect, it } from "vitest";
import { advanceDay } from "./advanceDay.js";
import type { GameState } from "./gameState.js";
import { isInjured } from "./players/isInjured.js";
import { loadNewGame } from "./loadNewGame.js";
import { loadGame, saveGame } from "./saveGame.js";

const start = loadNewGame(6, { coachClubId: "bahia-ba" });
let played: GameState = start;
for (let day = 0; day < 40; day++) played = advanceDay(played, {}).state;

/** The save as a build from before injury kinds, ratings, awards and records wrote it. */
function oldSave(state: GameState): string {
  const players = Object.fromEntries(
    Object.entries(state.players).map(([id, p]) => {
      const condition = { ...p.condition };
      delete condition.injury;
      const player = { ...p, condition };
      delete player.retiring;
      return [id, player];
    }),
  );
  const clubs = Object.fromEntries(
    Object.entries(state.history.clubs).map(([id, records]) => {
      const old = { ...records };
      delete old.mostSeasonGoals;
      delete old.longestUnbeaten;
      delete old.youngestScorer;
      delete old.unbeaten;
      return [id, old];
    }),
  );
  const current = { ...state.history.current };
  delete current.ratings;
  const history = { ...state.history, current, clubs };
  delete history.leagues;
  return JSON.stringify({ ...state, players, history });
}

describe("a save from before player life", () => {
  const injured = Object.values(played.players).find((p) => p.condition.injuredUntil !== null && p.condition.injuredUntil > played.date);

  it("loads, keeps the layoff of an injury in progress and plays on, its tallies and records starting empty", () => {
    if (!injured) throw new Error("nobody is injured after 40 days");
    const loaded = loadGame(oldSave(played));
    expect(loaded.players[injured.id]?.condition.injuredUntil).toBe(injured.condition.injuredUntil);
    expect(loaded.history.current.ratings).toBeUndefined();
    let next = loaded;
    while (next.date < (injured.condition.injuredUntil ?? "")) {
      expect(isInjured(next.players[injured.id] ?? injured, next.date)).toBe(true);
      next = advanceDay(next, {}).state;
    }
    expect(next.history.current.ratings && Object.keys(next.history.current.ratings).length).toBeGreaterThan(0);
  });

  it("round-trips the new fields unchanged", () => {
    const veteran = Object.values(played.players).find((p) => p.clubId === "bahia-ba");
    if (!veteran) throw new Error("no Bahia player");
    const retiring = { ...played, players: { ...played.players, [veteran.id]: { ...veteran, retiring: { afterSeason: 2026, hasBeenAsked: true } } } };
    expect(loadGame(saveGame(retiring))).toStrictEqual(retiring);
  });
});
