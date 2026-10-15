import { expect, test } from "vitest";
import { marketClockView, spendMarketTime } from "./marketClock.js";

const BUDGET = 300;
const noWindowOfHisOwn = { coach: {} };
const withoutMidSeasonWindow = { hasMidSeasonWindow: false as const, coach: {} };
const ownWindow = { hasMidSeasonWindow: false as const, coach: { personalWindowUntil: "2026-05-19" } };

test("the clock runs inside a coach's own window and stops with it", () => {
  const spent = spendMarketTime(null, ownWindow, "2026-05-12", BUDGET, 100);
  expect(marketClockView(spent, ownWindow, "2026-05-15", BUDGET)).toEqual({ budgetSeconds: BUDGET, leftSeconds: 200 });
  expect(marketClockView(spent, ownWindow, "2026-05-20", BUDGET)).toBeNull();
  expect(spendMarketTime(spent, ownWindow, "2026-05-20", BUDGET, 50)).toBe(spent);
});

test("the clock has no mid-season window to run in a game without it", () => {
  expect(marketClockView(null, noWindowOfHisOwn, "2026-08-10", BUDGET)).toEqual({ budgetSeconds: BUDGET, leftSeconds: BUDGET });
  expect(marketClockView(null, withoutMidSeasonWindow, "2026-08-10", BUDGET)).toBeNull();
});
