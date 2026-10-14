import { describe, expect, test } from "vitest";
import type { Board } from "@boleiro/engine/sim/coach/boardExpectations";
import type { Fixture } from "@boleiro/engine/sim/gameState";
import { newGameFromFiles } from "@boleiro/engine/sim/loadNewGame";
import { bundledGameFiles } from "@boleiro/game-client/engine/bundledGameFiles";
import { jobSecurity, nextMatch } from "./hubSelectors.js";

const game = newGameFromFiles(5, { coachClubId: "bahia-ba" }, bundledGameFiles);
const own = game.fixtures.filter((f) => f.homeId === "bahia-ba" || f.awayId === "bahia-ba").toSorted((a, b) => a.date.localeCompare(b.date));
const [first, second] = own;
if (!first || !second) throw new Error("Bahia needs two fixtures");

describe("nextMatch", () => {
  test("is the coach's first unplayed fixture from today on, with the opponent and the side", () => {
    const next = nextMatch(game);
    expect(next).toMatchObject({ fixture: { id: first.id }, isHome: first.homeId === "bahia-ba", isToday: false });
    expect(next?.opponentId).toBe(first.homeId === "bahia-ba" ? first.awayId : first.homeId);
    expect(next?.label).toMatch(/^Baiano · \d+ª rodada$/);
  });

  test("on the match day it is today's game", () => {
    expect(nextMatch({ ...game, date: first.date })).toMatchObject({ fixture: { id: first.id }, isToday: true });
  });

  test("a played fixture is no longer next", () => {
    const fixtures: Fixture[] = game.fixtures.map((f) => (f.id === first.id ? { ...f, result: { homeGoals: 1, awayGoals: 0 } } : f));
    expect(nextMatch({ ...game, date: first.date, fixtures })?.fixture.id).toBe(second.id);
  });

  test("a coach without a club has no next match", () => {
    expect(nextMatch({ ...game, coachClubId: null })).toBeNull();
  });
});

describe("jobSecurity", () => {
  const board = (pressure: number): Board => ({ expectation: "topHalf", targetPosition: 10, tableSize: 20, position: 10, games: 8, pressure });

  test("reads the board's pressure as one word", () => {
    expect(jobSecurity(board(-0.5))).toBe("Prestigiado");
    expect(jobSecurity(board(0))).toBe("Estável");
    expect(jobSecurity(board(0.4))).toBe("Pressionado");
    expect(jobSecurity(board(0.7))).toBe("Ameaçado");
  });

  test("a club without a board leaves the coach alone", () => {
    expect(jobSecurity(undefined)).toBe("Estável");
  });
});
