import { expect, test } from "vitest";
import { screenDirection } from "./screenDirection.js";

test("moving along the bar goes next to the right and previous to the left", () => {
  expect(screenDirection("/hub", "/tables")).toBe("next");
  expect(screenDirection("/history", "/squad")).toBe("previous");
});

test("opening a screen off the bar goes deeper, and coming back to the bar goes back", () => {
  expect(screenDirection("/hub", "/round")).toBe("deeper");
  expect(screenDirection("/squad", "/squad/p-12")).toBe("deeper");
  expect(screenDirection("/round", "/hub")).toBe("back");
  expect(screenDirection("/season-end", "/hub")).toBe("back");
});

test("the start menu is the top: leaving it goes deeper and returning to it goes back", () => {
  expect(screenDirection("/", "/new-game")).toBe("deeper");
  expect(screenDirection("/new-game", "/hub")).toBe("deeper");
  expect(screenDirection("/hub", "/")).toBe("back");
});

test("between two screens off the bar, the move goes deeper", () => {
  expect(screenDirection("/sacked", "/offers")).toBe("deeper");
});

test("opening the game on a screen counts as going deeper into it", () => {
  expect(screenDirection("/tables", "/tables")).toBe("deeper");
});
