import { loadNationalFootball } from "@boleiro/data/nationalFootball";
import { describe, expect, it } from "vitest";
import { advanceDay } from "../advanceDay.js";
import type { GameState } from "../gameState.js";
import { loadGame, saveGame } from "../saveGame.js";
import { loadNewGame } from "../loadNewGame.js";
import { withNations } from "./withNations.js";

const football = loadNationalFootball();

function playTo(state: GameState, date: string): GameState {
  let game = state;
  while (game.date < date) game = advanceDay(game, {}).state;
  return game;
}

describe("a save from before national football", () => {
  const old = playTo(loadNewGame(9, { coachClubId: "palmeiras-sp" }), "2026-04-05");
  const loaded = withNations(loadGame(saveGame(old)), football);

  it("gets national football with its windows so far already played", () => {
    const march = loaded.nations?.matches.filter((m) => m.date >= "2026-03-23" && m.date <= "2026-03-31") ?? [];
    expect(march.length).toBeGreaterThan(40);
    expect(march.every((m) => m.result !== null)).toBe(true);
    expect(loaded.nations?.matches.filter((m) => m.competitionId === "world-cup-2026").every((m) => m.result === null)).toBe(true);
  });

  it("gets the same national football every time it loads, and leaves its clubs as they were", () => {
    expect(withNations(loadGame(saveGame(old)), football)).toEqual(loaded);
    expect(loaded.players).toEqual(old.players);
    expect(loaded.fixtures).toEqual(old.fixtures);
  });

  it("plays on into the next window", () => {
    const june = playTo(loaded, "2026-06-10");
    expect(june.nations?.matches.filter((m) => m.date >= "2026-06-01" && m.date <= "2026-06-09").every((m) => m.result !== null)).toBe(true);
  }, 60_000);
});
