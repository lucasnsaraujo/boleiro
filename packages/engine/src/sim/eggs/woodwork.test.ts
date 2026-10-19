import { expect, test } from "vitest";
import type { PositionGroup } from "../../engine/match.js";
import type { SimPlayer } from "../gameState.js";
import { drawMatchPlay } from "../live/matchPlay.js";
import { freshCondition } from "../players/openingProfile.js";
import { woodworkOf } from "./woodwork.js";

const player = (id: string, clubId: string, group: PositionGroup): SimPlayer => ({
  id, name: id, group, strength: 70, clubId, wage: 0, contractUntil: "2027-12-31", age: 25, nationalities: ["Brazil"], trait: null, condition: freshCondition("2026-01-01"),
});
const eleven = (clubId: string) => [
  player(`${clubId}-gk`, clubId, "GK"),
  ...Array.from({ length: 10 }, (_, i) => player(`${clubId}-${i}`, clubId, i < 4 ? "DEF" : i < 8 ? "MID" : "ATT")),
];
const starters = [...eleven("home"), ...eleven("away")];
const FIXTURES = Array.from({ length: 2000 }, (_, i) => `fixture-${i}`);

test("a side hits the woodwork about 0.35 times a match, as Premier League sides did in 2023/24, and the same match always hits it the same", () => {
  const hits = FIXTURES.map((id) => woodworkOf(7, id, drawMatchPlay(7, id, starters, [], () => 0), []));
  const perSide = hits.reduce((sum, shots) => sum + shots.length, 0) / FIXTURES.length / 2;
  expect(perSide).toBeGreaterThan(0.3);
  expect(perSide).toBeLessThan(0.4);
  expect(hits.flat().every((shot) => shot.minute > 0 && shot.minute <= 90 && (shot.clubId === "home" || shot.clubId === "away"))).toBe(true);
  const id = "fixture-3";
  expect(woodworkOf(7, id, drawMatchPlay(7, id, starters, [], () => 0), [])).toEqual(hits[3]);
});
