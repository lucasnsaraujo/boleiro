import { describe, expect, it } from "vitest";
import { advanceDay } from "./advanceDay.js";
import type { GameState } from "./gameState.js";
import { loadNewGame } from "./loadNewGame.js";
import { loadGame, saveGame } from "./saveGame.js";

const playDays = (state: GameState, days: number) => {
  let current = state;
  for (let i = 0; i < days; i++) current = advanceDay(current, {}).state;
  return current;
};

describe("saveGame and loadGame", () => {
  const midSeason = playDays(loadNewGame(3, { coachClubId: "flamengo-rj" }), 200);

  it("round-trips the state exactly", () => {
    expect(loadGame(saveGame(midSeason))).toStrictEqual(midSeason);
  });

  it("continues a loaded save exactly like the original", () => {
    const original = playDays(midSeason, 60);
    const resumed = playDays(loadGame(saveGame(midSeason)), 60);
    expect(resumed).toEqual(original);
    expect(resumed.fixtures.filter((f) => f.result).length).toBeGreaterThan(midSeason.fixtures.filter((f) => f.result).length);
  });

  it("rejects a save from another version", () => {
    expect(() => loadGame(JSON.stringify({ ...midSeason, version: 99 }))).toThrow();
  });
});
