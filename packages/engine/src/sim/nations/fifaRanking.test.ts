import { describe, expect, it } from "vitest";
import { matchImportance, rankingPointsAfter } from "./fifaRanking.js";

describe("the FIFA ranking update", () => {
  it("gives an even draw nothing and a win half the match's importance", () => {
    expect(rankingPointsAfter({ home: 1500, away: 1500 }, { home: 1, away: 1 }, 10, false)).toEqual({ home: 1500, away: 1500 });
    expect(rankingPointsAfter({ home: 1500, away: 1500 }, { home: 2, away: 0 }, 10, false)).toEqual({ home: 1505, away: 1495 });
  });

  it("rewards an upset more than a favourite's win", () => {
    const upset = rankingPointsAfter({ home: 1400, away: 1800 }, { home: 1, away: 0 }, 25, false);
    const expected = rankingPointsAfter({ home: 1800, away: 1400 }, { home: 1, away: 0 }, 25, false);
    expect(upset.home - 1400).toBeGreaterThan(expected.home - 1800);
  });

  it("takes no points from a side knocked out of a final tournament", () => {
    const after = rankingPointsAfter({ home: 1800, away: 1500 }, { home: 0, away: 1 }, 60, true);
    expect(after.home).toBe(1800);
    expect(after.away).toBeGreaterThan(1500);
  });

  it("counts a shootout win as three quarters of a win and its loss as a draw", () => {
    const after = rankingPointsAfter({ home: 1500, away: 1500 }, { home: 1, away: 1, penaltyWinner: "home" }, 40, false);
    expect(after.home).toBe(1510);
    expect(after.away).toBe(1500);
  });

  it("weighs a World Cup knockout above its group stage, a qualifier and a friendly", () => {
    expect(matchImportance("world-cup", "quarter-finals")).toBe(60);
    expect(matchImportance("world-cup", "group")).toBe(50);
    expect(matchImportance("qualifiers", "group")).toBe(25);
    expect(matchImportance("friendlies", "friendly")).toBe(10);
  });
});
