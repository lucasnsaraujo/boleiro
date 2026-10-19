import { describe, expect, it } from "vitest";
import { advanceDay } from "./advanceDay.js";
import type { GameState } from "./gameState.js";
import { loadNewGame } from "./loadNewGame.js";

function playUntil(state: GameState, date: string): GameState {
  let current = state;
  while (current.date < date) current = advanceDay(current, {}).state;
  return current;
}

const kindsOf = (state: GameState) => new Set(Object.values(state.competitions).map((c) => c.kind));
const serieDSize = (state: GameState) => Object.values(state.clubs).filter((club) => club.division === "D").length;

describe("a game started without the estaduais", () => {
  const start = loadNewGame(6, { coachClubId: null, stateChampionships: false });
  const next = playUntil(start, "2027-01-01");

  it("plays no state championship, this season or the next", () => {
    expect(kindsOf(start).has("state")).toBe(false);
    expect(kindsOf(next).has("state")).toBe(false);
    expect(next.playsStateChampionships).toBe(false);
  });

  it("still fills the Copa do Brasil and refills the Série D from the ranking", () => {
    const cupOf = (state: GameState) => Object.values(state.competitions).find((c) => c.kind === "cup");
    expect(cupOf(start)?.clubIds.length).toBe(cupOf(loadNewGame(6, { coachClubId: null }))?.clubIds.length);
    expect(cupOf(next)?.clubIds.length).toBe(cupOf(start)?.clubIds.length);
    expect(serieDSize(next)).toBe(serieDSize(start));
  });

  it("leaves a game with the estaduais as it always was", () => {
    const usual = loadNewGame(6, { coachClubId: null });
    expect(kindsOf(usual).has("state")).toBe(true);
    expect("playsStateChampionships" in usual).toBe(false);
  });
});
