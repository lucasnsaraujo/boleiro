import { describe, expect, it } from "vitest";
import type { PositionGroup } from "../../engine/match.js";
import { advanceDay } from "../advanceDay.js";
import type { GameState, SimPlayer } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { freshCondition } from "../players/openingProfile.js";
import { drawMatchPlay } from "./matchPlay.js";
import { matchRatings, type RatedSide } from "./matchRatings.js";
import type { MatchEvent } from "./matchTimeline.js";
import { startMatchDay } from "./startMatchDay.js";

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

  it("cost a taker the same for a penalty the keeper saves as for one he puts wide", () => {
    const miss = (isSaved: boolean): MatchEvent[] => [{ type: "penaltyMiss", minute: 30, clubId: "away", playerId: "away-9", keeperId: "home-gk", isSaved }];
    expect(ratingOf(matchRatings(sides(), miss(true)), "away-9")).toBe(ratingOf(matchRatings(sides(), miss(false)), "away-9"));
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

  it("follow what a player did: the same player rates lower on a day he misses and misplaces more", () => {
    const starters = [...eleven("home"), ...eleven("away")];
    const mean = (form: number) => {
      const marks = Array.from({ length: 200 }, (_, i) => ratingOf(matchRatings(sides(), [], drawMatchPlay(1, `f${i}`, starters, [], () => form)), "home-9") ?? 0);
      return marks.reduce((sum, mark) => sum + mark, 0) / marks.length;
    };
    expect(mean(-1)).toBeLessThan(mean(1) - 0.3);
  });

  it("spread like FotMob's Série A ratings for each position over many seeded matches", () => {
    // FotMob's single-match ratings of 267 Série A players, by usual position (matchRatings.ts).
    const fotmob: Record<PositionGroup, { mean: number; sd: number }> = { GK: { mean: 7.11, sd: 1.02 }, DEF: { mean: 6.77, sd: 0.77 }, MID: { mean: 6.96, sd: 0.69 }, ATT: { mean: 6.67, sd: 0.74 } };
    let state: GameState = loadNewGame(3, { coachClubId: null });
    const marks: Record<PositionGroup, number[]> = { GK: [], DEF: [], MID: [], ATT: [] };
    while (marks.GK.length < 400) {
      const live = startMatchDay(state, {});
      for (const match of live.matches) {
        const play = match.play;
        if (!play) throw new Error("every match kicks off with its play");
        const players = Object.keys(play.players).flatMap((id) => state.players[id] ?? []);
        const startersOf = (clubId: string) => players.filter((p) => p.clubId === clubId && play.starters.includes(p.id));
        const bench = players.filter((p) => !play.starters.includes(p.id));
        const rated = matchRatings({ home: { clubId: match.homeId, starters: startersOf(match.homeId), bench }, away: { clubId: match.awayId, starters: startersOf(match.awayId), bench } }, match.events, play);
        for (const { playerId, rating } of [...rated.home, ...rated.away]) {
          const group = state.players[playerId]?.group;
          if (group) marks[group].push(rating);
        }
      }
      state = advanceDay(state, {}).state;
    }
    for (const group of ["GK", "DEF", "MID", "ATT"] as const) {
      const mean = marks[group].reduce((sum, mark) => sum + mark, 0) / marks[group].length;
      const sd = Math.sqrt(marks[group].reduce((sum, mark) => sum + (mark - mean) ** 2, 0) / marks[group].length);
      expect(Math.abs(mean - fotmob[group].mean), group).toBeLessThan(0.15);
      expect(Math.abs(sd - fotmob[group].sd), group).toBeLessThan(0.15);
    }
  });
});
