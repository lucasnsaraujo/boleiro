import { expect, test } from "vitest";
import type { PositionGroup } from "@boleiro/engine/engine/match";
import { linesOfEleven, planKeyProblem, redCardExample, shapeName } from "./matchPlanDraft.js";

const eleven = (DEF: number, MID: number, ATT: number) =>
  linesOfEleven([{ group: "GK" }, ...[...Array<PositionGroup>(DEF).fill("DEF"), ...Array<PositionGroup>(MID).fill("MID"), ...Array<PositionGroup>(ATT).fill("ATT")].map((group) => ({ group }))]);

test("a plan key must be a free letter or digit: not a game shortcut, not the coach's other key, not another coach's", () => {
  const taken = [{ key: "q", coachName: "Ana" }];
  expect(planKeyProblem("k", "tacticsKey", {}, taken)).toBeNull();
  expect(planKeyProblem("K", "tacticsKey", {}, taken)).toBeNull();
  expect(planKeyProblem("e", "tacticsKey", {}, taken)).toBe("E já é um atalho do jogo.");
  expect(planKeyProblem("2", "timeOutKey", {}, taken)).toBe("2 já é um atalho do jogo.");
  expect(planKeyProblem(" ", "timeOutKey", {}, taken)).toBe("Use uma letra ou um número.");
  expect(planKeyProblem("Enter", "timeOutKey", {}, taken)).toBe("Use uma letra ou um número.");
  expect(planKeyProblem("k", "timeOutKey", { tacticsKey: "k" }, taken)).toBe("K já é a sua tecla das táticas.");
  expect(planKeyProblem("q", "timeOutKey", {}, taken)).toBe("Q é a tecla de Ana.");
});

test("keeping the shape turns an eleven of 5-3-2 losing a defender into 5-3-1, and a 4-5-1 into 4-4-1", () => {
  const fiveThreeTwo = redCardExample(eleven(5, 3, 2));
  expect([shapeName(fiveThreeTwo.before), shapeName(fiveThreeTwo.after), fiveThreeTwo.payer]).toEqual(["5-3-2", "5-3-1", "ATT"]);
  const fourFiveOne = redCardExample(eleven(4, 5, 1));
  expect([shapeName(fourFiveOne.after), fourFiveOne.payer]).toEqual(["4-4-1", "MID"]);
});
