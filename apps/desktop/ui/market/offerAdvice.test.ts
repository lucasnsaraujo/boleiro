import { expect, test } from "vitest";
import { newGameFromFiles } from "@boleiro/engine/sim/loadNewGame";
import { bundledGameFiles } from "@boleiro/game-client/engine/bundledGameFiles";
import { offerAdvice } from "./offerAdvice.js";

const COACH = "sport-pe";
const game = newGameFromFiles(5, { coachClubId: COACH }, bundledGameFiles);
const budget = game.finances[COACH]?.transferBudget ?? 0;
const defenders = Object.values(game.players).filter((p) => p.clubId === COACH && p.group === "DEF");
const best = Math.max(...defenders.map((p) => p.strength));

test("takes the fee and three months of wages out of the transfer budget", () => {
  expect(offerAdvice(game, { group: "DEF", strength: 60 }, 1_000_000, 100_000).budgetLeft).toBe(budget - 1_300_000);
});

test("lists the coach's three best at the position, strongest first", () => {
  const { atPosition } = offerAdvice(game, { group: "DEF", strength: 60 }, 0, 0);
  expect(atPosition).toHaveLength(3);
  expect(atPosition[0]?.strength).toBe(best);
  expect(atPosition.map((p) => p.strength)).toEqual(atPosition.map((p) => p.strength).toSorted((a, b) => b - a));
});

test("names the starter a stronger player would replace, and nobody for a weaker one", () => {
  expect(offerAdvice(game, { group: "DEF", strength: best + 5 }, 0, 0).replaces).not.toBeNull();
  expect(offerAdvice(game, { group: "DEF", strength: 1 }, 0, 0).replaces).toBeNull();
});

test("counts the coach's squad", () => {
  expect(offerAdvice(game, { group: "DEF", strength: 60 }, 0, 0).squadSize).toBe(Object.values(game.players).filter((p) => p.clubId === COACH).length);
});
