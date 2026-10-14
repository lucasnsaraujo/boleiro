import { expect, test } from "vitest";
import { formatMoney } from "./formatMoney.js";

test("millions read with one decimal, the way a sports page writes them", () => {
  expect(formatMoney(1_234_567)).toBe("R$ 1,2 mi");
});

test("a round amount drops the decimal", () => {
  expect(formatMoney(48_000_000)).toBe("R$ 48 mi");
  expect(formatMoney(350_000)).toBe("R$ 350 mil");
});

test("billions and small amounts get their own unit", () => {
  expect(formatMoney(1_500_000_000)).toBe("R$ 1,5 bi");
  expect(formatMoney(900)).toBe("R$ 900");
});

test("a loss keeps its sign in front", () => {
  expect(formatMoney(-2_500_000)).toBe("-R$ 2,5 mi");
});
