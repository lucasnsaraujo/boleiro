import { expect, test } from "vitest";
import { formatGameDate } from "./formatGameDate.js";

test("a game date reads as day, month and year in Portuguese", () => {
  expect(formatGameDate("2026-01-01")).toBe("1 de janeiro de 2026");
});

test("the day does not slip back in timezones west of UTC", () => {
  expect(formatGameDate("2026-03-15")).toBe("15 de março de 2026");
});
