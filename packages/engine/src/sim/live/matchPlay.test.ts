import { describe, expect, it } from "vitest";
import type { PositionGroup } from "../../engine/match.js";
import type { SimPlayer } from "../gameState.js";
import { freshCondition } from "../players/openingProfile.js";
import { badDaysOf, drawMatchPlay, missedShotsOf, playerStatsAt, type PlayerStats } from "./matchPlay.js";
import type { MatchEvent } from "./matchTimeline.js";

const player = (id: string, clubId: string, group: PositionGroup): SimPlayer => ({
  id, name: id, group, strength: 70, clubId, wage: 0, contractUntil: "2027-12-31", age: 25, nationalities: ["Brazil"], trait: null, condition: freshCondition("2026-01-01"),
});
const eleven = (clubId: string) => [
  player(`${clubId}-gk`, clubId, "GK"),
  ...Array.from({ length: 10 }, (_, i) => player(`${clubId}-${i}`, clubId, i < 4 ? "DEF" : i < 8 ? "MID" : "ATT")),
];
const starters = [...eleven("home"), ...eleven("away")];
const FIXTURES = Array.from({ length: 300 }, (_, i) => `fixture-${i}`);

const total = (rows: readonly (PlayerStats | undefined)[], pick: (s: PlayerStats) => number) => rows.reduce((sum, s) => sum + (s ? pick(s) : 0), 0);

describe("a match's play", () => {
  it("has a player on a bad day miss the target and misplace passes more often than on a good day", () => {
    const statsOf = (form: number) => FIXTURES.map((id) => playerStatsAt(drawMatchPlay(1, id, starters, [], () => form), [], 90)["home-9"]);
    const bad = statsOf(-1);
    const good = statsOf(1);
    const onTargetShare = (rows: typeof bad) => total(rows, (s) => s.shotsOnTarget) / total(rows, (s) => s.shots);
    const astrayShare = (rows: typeof bad) => total(rows, (s) => s.misplacedPasses) / total(rows, (s) => s.passes + s.misplacedPasses);
    expect(onTargetShare(bad)).toBeLessThan(0.75 * onTargetShare(good));
    expect(astrayShare(bad)).toBeGreaterThan(1.5 * astrayShare(good));
    expect(total(bad, (s) => s.fouls)).toBeGreaterThan(total(good, (s) => s.fouls));
  });

  it("lets a substitute play in his own form: a good day coming on for a bad one puts fewer passes astray", () => {
    const sub = player("home-sub", "home", "ATT");
    const formOf = (p: SimPlayer) => (p.id === "home-9" ? -1 : p.id === "home-sub" ? 1 : 0);
    const change: MatchEvent[] = [{ type: "substitution", minute: 30, clubId: "home", playerId: "home-sub", offId: "home-9" }];
    const astray = (events: readonly MatchEvent[]) =>
      FIXTURES.reduce((sum, id) => {
        const stats = playerStatsAt(drawMatchPlay(1, id, starters, [sub], formOf), events, 90);
        return sum + (stats["home-9"]?.misplacedPasses ?? 0) + (stats["home-sub"]?.misplacedPasses ?? 0);
      }, 0);
    expect(astray(change)).toBeLessThan(0.8 * astray([]));
    const stats = playerStatsAt(drawMatchPlay(1, "f", starters, [sub], formOf), change, 90);
    expect(stats["home-sub"]).toMatchObject({ form: 1, minutes: 60 });
    expect(stats["home-9"]).toMatchObject({ form: -1, minutes: 30 });
  });

  it("never changes what a player did before a change made later", () => {
    const sub = player("home-sub", "home", "ATT");
    const play = drawMatchPlay(3, "f", starters, [sub], () => 0);
    const change: MatchEvent[] = [{ type: "substitution", minute: 60, clubId: "home", playerId: "home-sub", offId: "home-9" }];
    expect(playerStatsAt(play, change, 59)).toEqual(playerStatsAt(play, [], 59));
    expect(playerStatsAt(play, [], 59)["home-sub"]).toBeUndefined();
  });

  it("counts each goal as a shot on target and each card as a foul, and credits the keeper with the saves", () => {
    const events: MatchEvent[] = [
      { type: "goal", minute: 10, clubId: "home", playerId: "home-9", kind: "openPlay", assistId: "home-7" },
      { type: "goal", minute: 20, clubId: "home", playerId: "home-9", kind: "penalty" },
      { type: "card", minute: 30, clubId: "away", playerId: "away-2", card: "yellow" },
      { type: "card", minute: 50, clubId: "away", playerId: "away-2", card: "secondYellow" },
      { type: "penaltyMiss", minute: 70, clubId: "away", playerId: "away-9", keeperId: "home-gk", isSaved: true },
    ];
    for (const id of FIXTURES.slice(0, 50)) {
      const stats = playerStatsAt(drawMatchPlay(1, id, starters, [], () => 0), events, 90);
      const scorer = stats["home-9"];
      expect(scorer?.goals).toBe(2);
      expect(scorer?.shotsOnTarget).toBeGreaterThanOrEqual(2);
      expect(scorer?.shots).toBeGreaterThanOrEqual(scorer?.shotsOnTarget ?? Infinity);
      expect(stats["home-7"]?.assists).toBe(1);
      expect(stats["away-2"]).toMatchObject({ yellowCards: 1, redCards: 1, minutes: 50 });
      expect(stats["away-2"]?.fouls).toBeGreaterThanOrEqual(2);
      expect(stats["home-gk"]?.penaltiesSaved).toBe(1);
      const awayOnTarget = total(Object.values(stats).filter((s) => s.clubId === "away"), (s) => s.shotsOnTarget);
      expect(stats["home-gk"]?.saves).toBe(awayOnTarget);
      expect(stats["away-gk"]?.conceded).toBe(2);
    }
  });

  it("gives a side about as many shots, passes, tackles and fouls a match as FotMob's players make", () => {
    const sides = FIXTURES.map((id) => Object.values(playerStatsAt(drawMatchPlay(1, id, starters, [], () => 0), [], 90)).filter((s) => s.clubId === "home"));
    const perMatch = (pick: (s: PlayerStats) => number) => sides.reduce((sum, side) => sum + total(side, pick), 0) / sides.length;
    expect(perMatch((s) => s.shots)).toBeGreaterThan(9);
    expect(perMatch((s) => s.shots)).toBeLessThan(13);
    expect(perMatch((s) => s.passes + s.misplacedPasses)).toBeGreaterThan(350);
    expect(perMatch((s) => s.passes + s.misplacedPasses)).toBeLessThan(450);
    expect(perMatch((s) => s.tackles)).toBeGreaterThan(12);
    expect(perMatch((s) => s.fouls)).toBeGreaterThan(8);
  });

  it("has the assistant point out a player on a bad day once he has watched him for twenty minutes, and nobody else", () => {
    const subs = [player("home-sub", "home", "ATT"), player("home-sub2", "home", "ATT")];
    const formOf = (p: SimPlayer) => (p.id === "home-9" || p.id === "home-sub" || p.id === "home-8" ? -0.8 : p.id === "home-7" ? -0.3 : 0.2);
    const play = drawMatchPlay(1, "f", starters, subs, formOf);
    const events: MatchEvent[] = [
      { type: "substitution", minute: 15, clubId: "home", playerId: "home-sub", offId: "home-8" },
      { type: "substitution", minute: 60, clubId: "home", playerId: "home-sub2", offId: "home-9" },
    ];
    expect(badDaysOf(play, events)).toEqual([
      { playerId: "home-9", clubId: "home", minute: 20 },
      { playerId: "home-sub", clubId: "home", minute: 35 },
    ]);
  });
});

describe("the shots of a match that don't go in", () => {
  const bench = [player("home-sub", "home", "ATT")];

  it("are every starter's, in minute order, each with its player's club", () => {
    const play = drawMatchPlay(1, "fixture-shots", starters, bench, () => 0);
    const shots = missedShotsOf(play, []);
    const starterShots = starters.reduce((sum, p) => sum + (play.players[p.id]?.shots.length ?? 0), 0);
    expect(shots).toHaveLength(starterShots);
    expect(shots.map((s) => s.minute)).toEqual([...shots.map((s) => s.minute)].sort((a, b) => a - b));
    expect(shots.every((s) => s.clubId === play.players[s.playerId]?.clubId)).toBe(true);
    expect(shots.some((s) => s.playerId === "home-sub")).toBe(false);
  });

  it("fall only while their player is on the pitch: a substitute's after he comes on, the man he replaced's before", () => {
    const fixture = FIXTURES.find((id) => {
      const players = drawMatchPlay(1, id, starters, bench, () => 0).players;
      return players["home-9"]?.shots.some((s) => s.minute > 45) && players["home-sub"]?.shots.some((s) => s.minute > 45);
    });
    const play = drawMatchPlay(1, fixture ?? "", starters, bench, () => 0);
    const sub: MatchEvent = { type: "substitution", minute: 45, clubId: "home", playerId: "home-sub", offId: "home-9" };
    const shots = missedShotsOf(play, [sub]);
    expect(shots.filter((s) => s.playerId === "home-9").every((s) => s.minute <= 45)).toBe(true);
    const subs = shots.filter((s) => s.playerId === "home-sub");
    expect(subs.length).toBeGreaterThan(0);
    expect(subs.every((s) => s.minute > 45)).toBe(true);
  });
});
