import { describe, expect, it } from "vitest";
import type { PositionGroup } from "../engine/match.js";
import type { Fixture, SimPlayer } from "./gameState.js";
import { freshCondition } from "./players/openingProfile.js";
import { LOW_MORALE, playShootout, settleShootout, shootoutWinnerOf, type ShootoutSide } from "./settleShootout.js";

const player = (id: string, clubId: string, group: PositionGroup, strength: number): SimPlayer => ({
  id, name: id, group, strength, clubId, wage: 0, contractUntil: "2027-12-31", age: 25, nationalities: ["Brazil"], trait: null, condition: freshCondition("2026-01-01"),
});
const eleven = (clubId: string, outfield: number, keeper: number) => [
  player(`${clubId}-gk`, clubId, "GK", keeper),
  ...Array.from({ length: 10 }, (_, i) => player(`${clubId}-${i}`, clubId, i < 4 ? "DEF" : i < 8 ? "MID" : "ATT", outfield - i)),
];
const side = (clubId: string, onPitch: SimPlayer[], extra: Partial<ShootoutSide> = {}): ShootoutSide => ({ clubId, onPitch, morale: 60, ...extra });
const plain = (p: SimPlayer) => p.strength;
const stream = (seed: number) => {
  let s = seed + 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
};
const SHOOTOUTS = 600;

describe("a penalty shootout", () => {
  it("is won more often by the side with the better kickers and the better keeper", () => {
    const strong = eleven("strong", 85, 85);
    const weak = eleven("weak", 55, 50);
    const strongWins = Array.from({ length: SHOOTOUTS }, (_, seed) => playShootout(side("weak", weak), side("strong", strong), plain, stream(seed)).winnerId).filter(
      (id) => id === "strong",
    ).length;
    expect(strongWins / SHOOTOUTS).toBeGreaterThan(0.65);
  });

  it("is close to a coin flip between equal sides", () => {
    const home = eleven("home", 70, 70);
    const away = eleven("away", 70, 70);
    const homeWins = Array.from({ length: SHOOTOUTS }, (_, seed) => playShootout(side("home", home), side("away", away), plain, stream(seed)).winnerId).filter(
      (id) => id === "home",
    ).length;
    expect(homeWins / SHOOTOUTS).toBeGreaterThan(0.42);
    expect(homeWins / SHOOTOUTS).toBeLessThan(0.58);
  });

  it("takes five kicks each at most before sudden death, and stops once one side can't be caught", () => {
    for (let seed = 0; seed < 50; seed++) {
      const { events, winnerId } = playShootout(side("home", eleven("home", 70, 70)), side("away", eleven("away", 70, 70)), plain, stream(seed));
      const kicks = events.filter((e) => e.type === "shootoutKick");
      const scored = (clubId: string) => kicks.filter((k) => k.clubId === clubId && k.isScored).length;
      const taken = (clubId: string) => kicks.filter((k) => k.clubId === clubId).length;
      expect(Math.abs(taken("home") - taken("away"))).toBeLessThanOrEqual(1);
      expect(scored(winnerId)).toBeGreaterThan(scored(winnerId === "home" ? "away" : "home"));
      if (taken("home") > 5) expect(taken("home")).toBe(taken("away"));
      expect(shootoutWinnerOf(events, "home", "away")).toBe(winnerId);
    }
  });

  it("follows the coach's kicker order while the squad backs him", () => {
    const home = eleven("home", 70, 70);
    const order = ["home-9", "home-8", "home-gk"];
    const { events } = playShootout(side("home", home, { order, morale: LOW_MORALE + 20 }), side("away", eleven("away", 70, 70)), plain, stream(3));
    const kickers = events.flatMap((e) => (e.type === "shootoutKick" && e.clubId === "home" ? [e.playerId] : []));
    expect(kickers.slice(0, 3)).toEqual(order);
    expect(events.some((e) => e.type === "orderOverruled")).toBe(false);
  });

  it("is kicked in the squad's own order when its morale is low, and says so", () => {
    const home = eleven("home", 70, 70);
    const order = ["home-gk", "home-9", "home-8"];
    const { events } = playShootout(side("home", home, { order, morale: LOW_MORALE - 10 }), side("away", eleven("away", 70, 70)), plain, stream(3));
    const first = events.find((e) => e.type === "shootoutKick" && e.clubId === "home");
    expect(events).toContainEqual({ type: "orderOverruled", minute: 90, clubId: "home" });
    expect(first?.type === "shootoutKick" && first.playerId).toBe("home-0");
  });

  it("puts its winner on the fixture's result", () => {
    const fixture: Fixture = { id: "f", competitionId: "copa", stage: 0, date: "2026-05-01", homeId: "home", awayId: "away", tie: 0, result: { homeGoals: 1, awayGoals: 1 } };
    const { fixture: settled, events } = settleShootout(fixture, 7, side("home", eleven("home", 70, 70)), side("away", eleven("away", 70, 70)), plain);
    expect(settled.result?.penaltyWinnerId).toBe(shootoutWinnerOf(events, "home", "away"));
    expect(settled.result).toMatchObject({ homeGoals: 1, awayGoals: 1 });
  });
});
