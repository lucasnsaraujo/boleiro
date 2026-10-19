import { describe, expect, it } from "vitest";
import { loadFinances } from "@boleiro/data/finances";
import { loadNewGame } from "../loadNewGame.js";
import { renewFinances } from "./renewFinances.js";
import { projectedRevenue } from "./setBoardBudget.js";

const ended = loadNewGame(1, { coachClubId: null });
const smallest = (division: "C" | "D") => {
  const row = loadFinances().divisionEstimates.find((r) => r.division === division && r.size === "small");
  if (!row) throw new Error(`no small Série ${division} estimate`);
  return row.revenue.total - row.revenue.playerSales;
};
const revenueOf = (finances: typeof ended.finances, id: string) => {
  const finance = finances[id];
  if (!finance) throw new Error(`no finances for ${id}`);
  return projectedRevenue(finance);
};
const poorest = (division: "D" | null) =>
  Object.values(ended.clubs).filter((c) => c.division === division).map((c) => c.id).sort((a, b) => revenueOf(ended.finances, a) - revenueOf(ended.finances, b))[0] ?? "";

describe("season-start money of a promoted club", () => {
  it("lifts a poor club promoted into a division to at least the smallest real club's revenue there", () => {
    const fromState = poorest(null);
    const fromD = poorest("D");
    const club = (id: string) => {
      const found = ended.clubs[id];
      if (!found) throw new Error(`no club ${id}`);
      return found;
    };
    const clubs = { ...ended.clubs, [fromState]: { ...club(fromState), division: "D" as const }, [fromD]: { ...club(fromD), division: "C" as const } };
    const renewed = renewFinances(ended, clubs, ended.competitions, ended.fixtures, []);
    expect(revenueOf(renewed, fromState)).toBeGreaterThanOrEqual(smallest("D"));
    expect(revenueOf(renewed, fromD)).toBeGreaterThanOrEqual(smallest("C"));
  });
});
