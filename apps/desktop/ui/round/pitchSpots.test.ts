import { expect, test } from "vitest";
import type { PositionGroup } from "@boleiro/engine/engine/match";
import type { SquadPlayer } from "@boleiro/game-client/round/matchDayPlan";
import { pitchSpots } from "./pitchSpots.js";

const player = (id: string, group: PositionGroup, strength = 70): SquadPlayer => ({ id, name: id, group, strength, fatigue: 0, status: null });
const eleven = [
  player("gk", "GK"),
  ...["d1", "d2", "d3", "d4"].map((id) => player(id, "DEF")),
  ...["m1", "m2", "m3", "m4"].map((id) => player(id, "MID")),
  player("a1", "ATT"),
  player("a2", "ATT", 60),
];

test("a 4-4-2 puts the keeper at the back and spreads each line across the pitch", () => {
  const spots = pitchSpots(eleven, "4-4-2");
  expect(spots.get("gk")).toEqual({ x: 7, y: 50 });
  expect(["d1", "d2", "d3", "d4"].map((id) => spots.get(id)?.y)).toEqual([20, 40, 60, 80]);
  expect(spots.get("a1")?.x).toBeGreaterThan(spots.get("m1")?.x ?? 100);
});

test("a 4-5-1 drops the weaker forward into midfield, as the engine plays him", () => {
  const spots = pitchSpots(eleven, "4-5-1");
  expect(spots.get("a2")?.x).toBe(spots.get("m1")?.x);
  expect(spots.get("a1")?.y).toBe(50);
});
