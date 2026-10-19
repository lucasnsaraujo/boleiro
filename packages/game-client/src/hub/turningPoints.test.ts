import { expect, test } from "vitest";
import type { DayEvent } from "./inboxLines.js";
import { loadNewGame } from "@boleiro/engine/sim/loadNewGame";
import { turningPointsOf } from "./turningPoints.js";

const game = loadNewGame(7, { coachClubId: "bahia-ba" });
const fired = (isYou: boolean): DayEvent => ({ type: "coachFired", clubId: "bahia-ba", date: "2026-06-01", isYou, position: 18, targetPosition: 10 });

test("the board firing the coach is a turning point he must see", () => {
  expect(turningPointsOf(game, game, [fired(true)])).toEqual([{ kind: "fired", firing: fired(true) }]);
});

test("another club firing its coach and an ordinary day are not", () => {
  expect(turningPointsOf(game, game, [fired(false)])).toEqual([]);
  expect(turningPointsOf(game, game, [])).toEqual([]);
});
