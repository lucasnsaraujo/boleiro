import { describe, expect, it } from "vitest";
import { CALIBRATED, matchOdds, simulateMatch, type Team } from "./match.js";
import { seededRandom } from "./random.js";
import type { SendOffs } from "./sendOffRates.js";

const squad = (name: string, strength: number): Team => ({
  name,
  players: [
    { name: `${name} GK`, group: "GK", strength },
    ...Array.from({ length: 4 }, (_, i) => ({ name: `${name} D${i}`, group: "DEF" as const, strength })),
    ...Array.from({ length: 4 }, (_, i) => ({ name: `${name} M${i}`, group: "MID" as const, strength })),
    ...Array.from({ length: 2 }, (_, i) => ({ name: `${name} A${i}`, group: "ATT" as const, strength })),
  ],
});

describe("matchOdds", () => {
  it("gives the home side the edge between equal teams and sums to one", () => {
    const odds = matchOdds(squad("Home", 70), squad("Away", 70));
    expect(odds.home + odds.draw + odds.away).toBeCloseTo(1, 6);
    expect(odds.home).toBeGreaterThan(odds.away);
  });
});

describe("simulateMatch", () => {
  it("lands on each outcome about as often as the odds say", () => {
    const home = squad("Home", 74);
    const away = squad("Away", 66);
    const odds = matchOdds(home, away);
    const random = seededRandom(42);
    let homeWins = 0;
    const runs = 20_000;
    for (let i = 0; i < runs; i++) {
      const score = simulateMatch(home, away, random);
      if (score.homeGoals > score.awayGoals) homeWins++;
    }
    expect(homeWins / runs).toBeCloseTo(odds.home, 1);
  });

  it("replays the same result for the same seed", () => {
    const play = () => simulateMatch(squad("Home", 70), squad("Away", 68), seededRandom(7));
    expect(play()).toEqual(play());
  });
});

describe("a sending-off", () => {
  const home = squad("Home", 70);
  const away = squad("Away", 70);
  const full = matchOdds(home, away);

  it("cuts the ten men's goal rate to two thirds and lifts the opponent's by a quarter for the minutes left", () => {
    const atHalfTime = matchOdds(home, away, CALIBRATED, { home: [45], away: [] });
    expect(atHalfTime.expectedHomeGoals).toBeCloseTo(full.expectedHomeGoals * (0.5 + 0.5 * (2 / 3)), 6);
    expect(atHalfTime.expectedAwayGoals).toBeCloseTo(full.expectedAwayGoals * (0.5 + 0.5 * 1.25), 6);
  });

  it("changes nothing at the final whistle and the most at kick-off", () => {
    expect(matchOdds(home, away, CALIBRATED, { home: [90], away: [] }).home).toBeCloseTo(full.home, 9);
    const early = matchOdds(home, away, CALIBRATED, { home: [0], away: [] });
    const late = matchOdds(home, away, CALIBRATED, { home: [80], away: [] });
    expect(early.home).toBeLessThan(late.home);
    expect(late.home).toBeLessThan(full.home);
  });

  it("stacks for each side when both lose a man", () => {
    const both = matchOdds(home, away, CALIBRATED, { home: [30], away: [60] });
    const homeRate = (30 + 30 * (2 / 3) + 30 * (2 / 3) * 1.25) / 90;
    expect(both.expectedHomeGoals).toBeCloseTo(full.expectedHomeGoals * homeRate, 6);
  });

  it("makes the ten men lose more often in simulated matches, replaying the same way for a seed", () => {
    const homeWins = (sendOffs?: SendOffs) => {
      const random = seededRandom(11);
      let wins = 0;
      for (let i = 0; i < 5_000; i++) {
        const score = simulateMatch(home, away, random, CALIBRATED, sendOffs);
        if (score.homeGoals > score.awayGoals) wins++;
      }
      return wins / 5_000;
    };
    const tenMen = homeWins({ home: [10], away: [] });
    expect(tenMen).toBeLessThan(homeWins() - 0.08);
    expect(homeWins({ home: [10], away: [] })).toBe(tenMen);
  });
});
