import { expect, test } from "vitest";
import type { Fixture } from "@boleiro/engine/sim/gameState";
import type { RoundTable } from "@boleiro/game-client/round/liveRoundOf";
import { liveTable, shortTable } from "./liveTable.js";

const fixture = (id: string, homeId: string, awayId: string, score: [number, number] | null): Fixture => ({
  id,
  competitionId: "a",
  stage: 0,
  date: score ? "2026-04-01" : "2026-04-08",
  homeId,
  awayId,
  result: score && { homeGoals: score[0], awayGoals: score[1] },
});

const table: RoundTable = {
  clubIds: ["a", "b", "c", "d"],
  drawOrder: ["a", "b", "c", "d"],
  fixtures: [fixture("r1", "a", "b", [1, 0]), fixture("r2", "c", "d", [0, 0]), fixture("today1", "b", "a", null), fixture("today2", "d", "c", null)],
};

test("today's scores count as if the matches ended now, and each club's move is measured from kick-off", () => {
  const rows = liveTable(
    table,
    new Map([
      ["today1", { home: 3, away: 0 }],
      ["today2", { home: 0, away: 0 }],
    ]),
  );
  expect(rows.map((r) => [r.clubId, r.position, r.points, r.move])).toEqual([
    ["b", 1, 3, 3],
    ["a", 2, 3, -1],
    ["c", 3, 2, -1],
    ["d", 4, 2, -1],
  ]);
});

test("with no scores yet the table is the one before kick-off and nobody has moved", () => {
  expect(liveTable(table, new Map()).map((r) => [r.clubId, r.move])).toEqual([
    ["a", 0],
    ["c", 0],
    ["d", 0],
    ["b", 0],
  ]);
});

test("the short table keeps seven rows around the coach's club, sliding at either end", () => {
  const [any] = liveTable(table, new Map());
  if (!any) throw new Error("the table has rows");
  const rows = Array.from({ length: 20 }, (_, i) => ({ ...any, clubId: `c${i + 1}`, position: i + 1 }));
  expect(shortTable(rows, "c10").map((r) => r.position)).toEqual([7, 8, 9, 10, 11, 12, 13]);
  expect(shortTable(rows, "c1").map((r) => r.position)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  expect(shortTable(rows, "c20").map((r) => r.position)).toEqual([14, 15, 16, 17, 18, 19, 20]);
  expect(shortTable(rows, "c10", 3).map((r) => r.position)).toEqual([9, 10, 11]);
  expect(shortTable(rows, "c1", 3).map((r) => r.position)).toEqual([1, 2, 3]);
});
