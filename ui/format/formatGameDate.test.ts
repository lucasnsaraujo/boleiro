import { expect, test } from "vitest";
import { formatGameDate, formatMatchDate, formatRowDate, monthName } from "./formatGameDate.js";

test("a game date reads as day, month and year in Portuguese", () => {
  expect(formatGameDate("2026-01-01")).toBe("1 de janeiro de 2026");
});

test("the day does not slip back in timezones west of UTC", () => {
  expect(formatGameDate("2026-03-15")).toBe("15 de março de 2026");
});

test("a match date reads as weekday, day and month", () => {
  expect(formatMatchDate("2026-01-11")).toBe("domingo, 11 de janeiro");
});

test("a row date is the short weekday and the day", () => {
  expect(formatRowDate("2026-03-01")).toBe("dom 1");
});

test("a month name comes from its number", () => {
  expect(monthName(3)).toBe("março");
});
