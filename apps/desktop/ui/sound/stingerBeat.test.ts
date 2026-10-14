import { expect, test } from "vitest";
import { stingerBeat } from "./stingerBeat.js";

test("a stinger lands on its last chord: the title on the third, promotion on the fourth, relegation on its low close", () => {
  expect(stingerBeat("title")).toBe(400);
  expect(stingerBeat("promotion")).toBe(360);
  expect(stingerBeat("relegation")).toBe(840);
});

test("the sacking lands almost at once, on its drone", () => {
  expect(stingerBeat("sacked")).toBe(50);
});

test("a recorded cue with no synthesised notes lands at its start", () => {
  expect(stingerBeat("coachGoal")).toBe(0);
});
