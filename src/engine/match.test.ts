import { describe, expect, it } from "vitest";
import { matchOdds, simulateMatch, type Team } from "./match.js";
import { seededRandom } from "./random.js";

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
