import { describe, expect, it } from "vitest";
import type { DayEvent } from "../hub/inboxLines.js";
import type { CoachSeasonReviewed } from "../../src/sim/coach/startCoachSeason.js";
import { emptyLedger } from "../../src/sim/finances/ledger.js";
import type { Ledger } from "../../src/sim/gameState.js";
import { newHistory, type SeasonRecord } from "../../src/sim/history/history.js";
import { seasonReview, type SeasonEnded, type SeasonStarted } from "./seasonReview.js";

const serieA = Array.from({ length: 20 }, (_, i) => `a${i + 1}`);
const serieB = Array.from({ length: 20 }, (_, i) => `b${i + 1}`);

const record = (changes: Partial<SeasonRecord>): SeasonRecord => ({
  season: 2026,
  champions: { "serie-a": "a1", "serie-b": "b1", "copa-do-brasil": "a2" },
  topScorers: {},
  promoted: { A: [], B: ["b1", "b2", "b3", "b4"], C: [], D: [] },
  relegated: { A: ["a17", "a18", "a19", "a20"], B: [], C: [], D: [] },
  tables: { A: serieA, B: serieB, C: [], D: [] },
  ...changes,
});

const withPrizes = (prizes: number): Ledger => {
  const ledger = emptyLedger();
  return { ...ledger, revenue: { ...ledger.revenue, prizes } };
};
const monthWithPrizes = (prizes: number) => ({ ...withPrizes(prizes), points: 0, games: 0 });

function ended(coachClubId: string | null, reputation = 30): SeasonEnded {
  return { coachClubId, coach: { reputation }, competitions: {}, fixtures: [] };
}

function started(clubId: string, { copaPrizes = 0, continental = 0, reputation = 30, until = 2026 } = {}, season = record({})): SeasonStarted {
  const history = { ...newHistory(2027, "2027-01-01", clubId), seasons: [season] };
  return {
    history,
    coach: { reputation, contract: { salary: 50_000, untilSeason: until } },
    finances: { [clubId]: { lastSeason: withPrizes(copaPrizes), month: monthWithPrizes(continental) } },
  };
}

const reviewed = (clubId: string, position: number, targetPosition: number, reputation: number): CoachSeasonReviewed => ({
  type: "coachSeasonReviewed",
  clubId,
  season: 2026,
  expectation: "avoidRelegation",
  targetPosition,
  position,
  won: false,
  promoted: false,
  reputation,
});

describe("the end-of-season review", () => {
  it("shows a promotion with its final place and the board's renewal", () => {
    const events: DayEvent[] = [
      { ...reviewed("b3", 3, 4, 41), expectation: "promotion", promoted: true },
      { type: "contractRenewed", clubId: "b3", untilSeason: 2027 },
    ];
    const review = seasonReview(ended("b3"), started("b3", { reputation: 41, until: 2027 }), events);
    expect(review.placing).toEqual({ division: "B", position: 3, tableSize: 20, move: "promoted" });
    expect(review.titles).toEqual([]);
    expect(review.continental).toBeNull();
    expect(review.verdict).toMatchObject({ hasMetTarget: true, contract: { kind: "renewed", untilSeason: 2027 }, reputationBefore: 30, reputationAfter: 41 });
  });

  it("shows a relegation and the contract the board let end", () => {
    const events: DayEvent[] = [reviewed("a19", 19, 16, 22), { type: "contractEnded", clubId: "a19", season: 2026 }];
    const review = seasonReview(ended("a19"), started("a19", { reputation: 22 }), events);
    expect(review.placing).toEqual({ division: "A", position: 19, tableSize: 20, move: "relegated" });
    expect(review.verdict).toMatchObject({ hasMetTarget: false, contract: { kind: "ended" }, reputationAfter: 22 });
  });

  it("lists the titles won, the continental place and the prize money", () => {
    const events: DayEvent[] = [{ ...reviewed("a1", 1, 1, 70), expectation: "title", won: true }];
    const review = seasonReview(ended("a1", 60), started("a1", { copaPrizes: 4_000_000, continental: 18_000_000, until: 2027 }), events);
    expect(review.titles).toEqual(["serie-a"]);
    expect(review.placing?.move).toBeNull();
    expect(review.continental).toBe("libertadores");
    expect(review.prizeMoney).toBe(22_000_000);
    expect(review.verdict?.contract).toEqual({ kind: "running", untilSeason: 2027 });
  });

  it("sends the clubs just below the Libertadores to the preliminary phase and the Sul-Americana", () => {
    expect(seasonReview(ended("a5"), started("a5"), []).continental).toBe("preLibertadores");
    expect(seasonReview(ended("a8"), started("a8"), []).continental).toBe("sulAmericana");
    expect(seasonReview(ended("a12"), started("a12"), []).continental).toBeNull();
  });

  it("gives a coach without a club only the season's champions", () => {
    const review = seasonReview(ended(null), started("a1"), []);
    expect(review.clubId).toBeNull();
    expect(review.placing).toBeNull();
    expect(review.verdict).toBeNull();
    expect(review.champions).toMatchObject({ "serie-a": "a1", "copa-do-brasil": "a2" });
  });
});
