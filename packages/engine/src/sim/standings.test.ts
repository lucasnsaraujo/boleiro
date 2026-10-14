import { describe, expect, it } from "vitest";
import type { Fixture } from "./gameState.js";
import { standings } from "./standings.js";

let nextId = 0;
const game = (homeId: string, awayId: string, homeGoals: number, awayGoals: number): Fixture => ({
  id: `f${nextId++}`,
  competitionId: "test",
  stage: 0,
  date: "2026-04-05",
  homeId,
  awayId,
  result: { homeGoals, awayGoals },
});

const order = (fixtures: Fixture[], clubs: string[], drawOrder = clubs) =>
  standings(clubs, fixtures, drawOrder).map((row) => row.clubId);

describe("standings", () => {
  it("counts 3 points for a win and 1 for a draw", () => {
    const table = standings(["a", "b", "c"], [game("a", "b", 2, 0), game("b", "c", 1, 1)], ["a", "b", "c"]);
    expect(table.map((row) => [row.clubId, row.points, row.played])).toEqual([
      ["a", 3, 1],
      ["c", 1, 1],
      ["b", 1, 2],
    ]);
  });

  it("ranks more wins above a better goal difference on equal points", () => {
    const fixtures = [
      game("a", "x", 1, 0), game("a", "y", 0, 1), game("a", "z", 0, 1), game("a", "w", 1, 0),
      game("b", "x", 5, 0), game("b", "y", 1, 1), game("b", "z", 1, 1), game("b", "w", 1, 1), game("b", "v", 0, 1),
    ];
    expect(order(fixtures, ["b", "a"]).slice(0, 2)).toEqual(["a", "b"]);
  });

  it("ranks better goal difference, then more goals scored", () => {
    const byDifference = [game("a", "x", 3, 0), game("b", "x", 3, 1)];
    expect(order(byDifference, ["b", "a"])).toEqual(["a", "b"]);
    const byGoals = [game("a", "x", 2, 1), game("b", "x", 3, 2)];
    expect(order(byGoals, ["a", "b"])).toEqual(["b", "a"]);
  });

  it("uses head-to-head when exactly two clubs are level on everything else", () => {
    const fixtures = [game("a", "b", 0, 1), game("a", "x", 1, 0), game("b", "y", 0, 1)];
    expect(order(fixtures, ["a", "b"], ["a", "b"])).toEqual(["b", "a"]);
  });

  it("ranks fewer red cards, then fewer yellows, above the draw when clubs are still level", () => {
    const carded = (fixture: Fixture, home: [number, number], away: [number, number]): Fixture => ({
      ...fixture,
      result: fixture.result && { ...fixture.result, cards: { home: { yellows: home[0], reds: home[1] }, away: { yellows: away[0], reds: away[1] } } },
    });
    const level = [game("a", "b", 1, 0), game("b", "c", 1, 0), game("c", "a", 1, 0)];
    const [ab, bc, ca] = level;
    if (!ab || !bc || !ca) throw new Error("missing game");
    expect(order([carded(ab, [5, 0], [0, 0]), carded(bc, [0, 1], [0, 0]), ca], ["a", "b", "c"], ["b", "a", "c"])).toEqual(["c", "a", "b"]);
    const pair = [carded(game("a", "b", 1, 1), [3, 0], [1, 0])];
    expect(order(pair, ["a", "b"], ["a", "b"])).toEqual(["b", "a"]);
  });

  it("skips head-to-head and falls back to the draw when three clubs are level", () => {
    const fixtures = [game("a", "b", 1, 0), game("b", "c", 1, 0), game("c", "a", 1, 0)];
    expect(order(fixtures, ["a", "b", "c"], ["c", "a", "b"])).toEqual(["c", "a", "b"]);
  });
});
