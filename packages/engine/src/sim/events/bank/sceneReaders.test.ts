import { describe, expect, it } from "vitest";
import type { GameState } from "../../gameState.js";
import { loadNewGame } from "../../loadNewGame.js";
import type { EventScene } from "../eventType.js";
import { nextMatch } from "./sceneReaders.js";

const CLUB = "flamengo-rj";
const start = loadNewGame(5, { coachClubId: null });
const sceneOf = (state: GameState, date = state.date, clubId = CLUB): EventScene => ({ state, clubId, squad: [], date, played: [], random: () => 0.5 });
const ownDates = (state: GameState, clubId = CLUB) => state.fixtures.filter((f) => f.homeId === clubId || f.awayId === clubId).map((f) => f.date).sort();

describe("the scene's next match", () => {
  it("is the club's first match after the scene's day", () => {
    const [first, second] = ownDates(start);
    expect(nextMatch(sceneOf(start))?.date).toBe(first);
    expect(nextMatch(sceneOf(start, first))?.date).toBe(second);
    const other = "palmeiras-sp";
    expect(nextMatch(sceneOf(start, start.date, other))?.date).toBe(ownDates(start, other)[0]);
  });

  it("skips a match once it is played, on the same day", () => {
    const [first, second] = ownDates(start);
    expect(nextMatch(sceneOf(start))?.date).toBe(first);
    const fixtures = start.fixtures.map((f) => (f.date === first && (f.homeId === CLUB || f.awayId === CLUB) ? { ...f, result: { homeGoals: 1, awayGoals: 0 } } : f));
    expect(nextMatch(sceneOf({ ...start, fixtures }, start.date))?.date).toBe(second);
  });
});
