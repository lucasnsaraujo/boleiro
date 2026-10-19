import { describe, expect, it } from "vitest";
import { CALIBRATED } from "../engine/match.js";
import { paramsForLeagueAbroad } from "../engine/paramsForLeagueAbroad.js";
import type { LeagueCompetition } from "./gameState.js";
import { paramsForCompetition } from "./paramsForCompetition.js";

const leagueAbroad = (country: string, level: number): LeagueCompetition => ({
  id: `${country}-${level + 1}-2026`,
  kind: "league",
  format: "round-robin",
  division: null,
  abroad: { country, level, name: "", promoted: 0, relegated: 0 },
  season: 2026,
  clubIds: [],
  stages: [],
  stageDates: [],
  drawOrder: [],
});

describe("a league abroad in the full tier", () => {
  it("plays at the params its result-only games use, fitted or guessed", () => {
    for (const [country, level] of [["gb-eng", 0], ["it", 1], ["cl", 0], ["cz", 1]] as const) {
      expect(paramsForCompetition(leagueAbroad(country, level), 0)).toEqual(paramsForLeagueAbroad(country, level));
    }
  });

  it("plays the Premier League at its own fit, not Série A's", () => {
    expect(paramsForCompetition(leagueAbroad("gb-eng", 0), 0)).not.toEqual(CALIBRATED);
  });
});
