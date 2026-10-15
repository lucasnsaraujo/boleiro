import { describe, expect, it } from "vitest";
import type { PositionGroup } from "../../engine/match.js";
import type { SimPlayer } from "../gameState.js";
import { freshCondition } from "../players/openingProfile.js";
import { matchRatings, type RatedSide } from "./matchRatings.js";
import type { MatchEvent } from "./matchTimeline.js";

const player = (id: string, clubId: string, group: PositionGroup): SimPlayer => ({
  id, name: id, group, strength: 70, clubId, wage: 0, contractUntil: "2027-12-31", age: 25, nationalities: ["Brazil"], trait: null, condition: freshCondition("2026-01-01"),
});
const eleven = (clubId: string) => [
  player(`${clubId}-gk`, clubId, "GK"),
  ...Array.from({ length: 10 }, (_, i) => player(`${clubId}-${i}`, clubId, i < 4 ? "DEF" : i < 8 ? "MID" : "ATT")),
];
const sides = (bench: SimPlayer[] = []): { home: RatedSide; away: RatedSide } => ({
  home: { clubId: "home", starters: eleven("home"), bench },
  away: { clubId: "away", starters: eleven("away"), bench: [] },
});
const ratingOf = (ratings: ReturnType<typeof matchRatings>, id: string) => [...ratings.home, ...ratings.away].find((r) => r.playerId === id)?.rating;

describe("match ratings", () => {
  it("give everyone who played a mark from 0 to 10, in tenths", () => {
    const ratings = matchRatings(sides(), []);
    expect(ratings.home).toHaveLength(11);
    for (const { rating } of [...ratings.home, ...ratings.away]) {
      expect(rating).toBeGreaterThanOrEqual(0);
      expect(rating).toBeLessThanOrEqual(10);
      expect(Math.round(rating * 10)).toBeCloseTo(rating * 10, 6);
    }
  });

  it("rate a scorer and his assistant above a team-mate who did neither, and an own goal below", () => {
    const events: MatchEvent[] = [
      { type: "goal", minute: 20, clubId: "home", playerId: "home-9", kind: "openPlay", assistId: "home-7" },
      { type: "goal", minute: 60, clubId: "home", playerId: "away-1", kind: "ownGoal" },
    ];
    const ratings = matchRatings(sides(), events);
    const quiet = ratingOf(ratings, "home-8") ?? 0;
    expect(ratingOf(ratings, "home-9")).toBeGreaterThan(ratingOf(ratings, "home-7") ?? Infinity);
    expect(ratingOf(ratings, "home-7")).toBeGreaterThan(quiet);
    expect(ratingOf(ratings, "away-1")).toBeLessThan(ratingOf(ratings, "away-2") ?? -Infinity);
  });

  it("mark down a player sent off and a keeper who lets goals in, and mark up a keeper who saves a penalty", () => {
    const events: MatchEvent[] = [
      { type: "card", minute: 30, clubId: "away", playerId: "away-2", card: "red" },
      { type: "goal", minute: 50, clubId: "home", playerId: "home-9", kind: "header" },
      { type: "goal", minute: 70, clubId: "home", playerId: "home-8", kind: "openPlay" },
      { type: "penaltyMiss", minute: 80, clubId: "away", playerId: "away-9", keeperId: "home-gk", isSaved: true },
    ];
    const ratings = matchRatings(sides(), events);
    expect(ratingOf(ratings, "away-2")).toBeLessThan(ratingOf(ratings, "away-3") ?? -Infinity);
    expect(ratingOf(ratings, "away-gk")).toBeLessThan(ratingOf(ratings, "home-gk") ?? -Infinity);
    expect(ratingOf(ratings, "away-9")).toBeLessThan(ratingOf(ratings, "away-8") ?? -Infinity);
  });

  it("rate a substitute who came on, and leave out the ones who stayed on the bench", () => {
    const sub = player("home-sub", "home", "ATT");
    const unused = player("home-unused", "home", "MID");
    const events: MatchEvent[] = [{ type: "substitution", minute: 70, clubId: "home", playerId: "home-sub", offId: "home-9" }];
    const ratings = matchRatings(sides([sub, unused]), events);
    expect(ratings.home.map((r) => r.playerId)).toContain("home-sub");
    expect(ratings.home.map((r) => r.playerId)).not.toContain("home-unused");
  });

  it("give a player hurt early and never replaced no more credit than one taken off at the same minute", () => {
    const events: MatchEvent[] = [
      { type: "injury", minute: 10, clubId: "home", playerId: "home-1", days: 20 },
      { type: "substitution", minute: 10, clubId: "home", playerId: "home-sub", offId: "home-2" },
    ];
    const ratings = matchRatings(sides([player("home-sub", "home", "DEF")]), events);
    expect(ratingOf(ratings, "home-1")).toBe(ratingOf(ratings, "home-2"));
  });

  it("charge a goal let in at a change's minute to the player going off, not the one coming on", () => {
    const events: MatchEvent[] = [
      { type: "goal", minute: 70, clubId: "away", playerId: "away-9", kind: "openPlay" },
      { type: "substitution", minute: 70, clubId: "home", playerId: "home-sub", offId: "home-1" },
    ];
    const ratings = matchRatings(sides([player("home-sub", "home", "DEF")]), events);
    expect(ratingOf(ratings, "home-1")).toBeLessThan(ratingOf(ratings, "home-sub") ?? -Infinity);
  });
});
