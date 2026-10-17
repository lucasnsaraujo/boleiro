import { describe, expect, it } from "vitest";
import { matchOdds, simulateExtraTime, type Player, type Team } from "./match.js";
import { randomStream } from "./random.js";

const side = (name: string, strength: number): Team => ({
  name,
  players: [
    { name: `${name}-gk`, group: "GK", strength },
    ...Array.from({ length: 10 }, (_, i): Player => ({ name: `${name}-${i}`, group: i < 4 ? "DEF" : i < 8 ? "MID" : "ATT", strength })),
  ],
});
const MATCHES = 20000;

describe("extra time", () => {
  it("scores about a third of a match's goals, each side by its strength", () => {
    const home = side("home", 72);
    const away = side("away", 66);
    const random = randomStream(11).next;
    const totals = { home: 0, away: 0 };
    for (let i = 0; i < MATCHES; i++) {
      const goals = simulateExtraTime(home, away, random);
      totals.home += goals.homeGoals;
      totals.away += goals.awayGoals;
    }
    const odds = matchOdds(home, away);
    expect(totals.home / MATCHES).toBeCloseTo(odds.expectedHomeGoals / 3, 1);
    expect(totals.away / MATCHES).toBeCloseTo(odds.expectedAwayGoals / 3, 1);
    expect(totals.home).toBeGreaterThan(totals.away);
  });

  it("scores less for a side that lost a man in the ninety minutes", () => {
    const team = side("home", 70);
    const random = randomStream(5).next;
    let full = 0;
    let short = 0;
    for (let i = 0; i < MATCHES; i++) {
      full += simulateExtraTime(team, side("away", 70), random).homeGoals;
      short += simulateExtraTime(team, side("away", 70), random, undefined, { home: [80], away: [] }).homeGoals;
    }
    expect(short).toBeLessThan(full * 0.8);
  });
});
