import { expect, test } from "vitest";
import { savedWhen } from "./savedWhen.js";

// Local times, as the coach reads his clock: Wednesday 14 October 2026, 22:10.
const now = new Date(2026, 9, 14, 22, 10);

test("a save from today or yesterday says so, with the time", () => {
  expect(savedWhen(new Date(2026, 9, 14, 21, 42).toISOString(), now)).toBe("hoje, 21:42");
  expect(savedWhen(new Date(2026, 9, 13, 8, 5).toISOString(), now)).toBe("ontem, 08:05");
});

test("a save from this week gives the weekday and the time", () => {
  expect(savedWhen(new Date(2026, 9, 9, 18, 5).toISOString(), now)).toBe("sexta, 18:05");
});

test("an older save gives the day and the month", () => {
  expect(savedWhen(new Date(2026, 9, 3, 12, 0).toISOString(), now)).toBe("3 out");
  expect(savedWhen(new Date(2025, 8, 12, 12, 0).toISOString(), now)).toBe("12 set 2025");
});
