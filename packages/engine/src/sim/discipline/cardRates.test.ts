import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseCsv } from "@boleiro/data/csv";
import type { LeagueCompetition } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { loadEurope } from "../world/loadEurope.js";
import { CARD_RATES, cardRatesOf, cardRatesOfFixture, LEAGUE_ABROAD_CARD_RATES } from "./cardRates.js";

const RATES_CSV = new URL("../../../../../data/history/football-data/league-rates.csv", import.meta.url);

const leagueAbroad = (key: string): LeagueCompetition => {
  const country = key.slice(0, key.lastIndexOf("-"));
  const level = Number(key.slice(key.lastIndexOf("-") + 1)) - 1;
  return { id: `${key}-2026`, kind: "league", format: "round-robin", division: null, abroad: { country, level, name: "", promoted: 0, relegated: 0 }, season: 2026, clubIds: [], stages: [], stageDates: [], drawOrder: [] };
};

/** Each league's real cards per side and match over the seasons football-data.co.uk lists them. */
function realCards(): Map<string, { matches: number; homeYellows: number; awayYellows: number; homeReds: number; awayReds: number }> {
  const totals = new Map<string, { matches: number; homeYellows: number; awayYellows: number; homeReds: number; awayReds: number }>();
  for (const row of parseCsv(readFileSync(RATES_CSV, "utf8"))) {
    if (Number(row.card_matches) === 0) continue;
    const total = totals.get(row.league ?? "") ?? { matches: 0, homeYellows: 0, awayYellows: 0, homeReds: 0, awayReds: 0 };
    total.matches += Number(row.card_matches);
    total.homeYellows += Number(row.home_yellows);
    total.awayYellows += Number(row.away_yellows);
    total.homeReds += Number(row.home_reds);
    total.awayReds += Number(row.away_reds);
    totals.set(row.league ?? "", total);
  }
  return totals;
}

describe("the cards of a league abroad in the full tier", () => {
  it.each([...realCards()])("draws %s's at its real yellows and reds per side", (key, real) => {
    const { home, away } = cardRatesOf(leagueAbroad(key));
    expect(home.yellows).toBeCloseTo(real.homeYellows / real.matches, 2);
    expect(away.yellows).toBeCloseTo(real.awayYellows / real.matches, 2);
    expect(home.reds).toBeCloseTo(real.homeReds / real.matches, 3);
    expect(away.reds).toBeCloseTo(real.awayReds / real.matches, 3);
  });

  it("borrows Série A's where football-data.co.uk has no cards", () => {
    expect(cardRatesOf(leagueAbroad("ar-1"))).toEqual(CARD_RATES.A);
  });

  it("draws a result-only league match abroad, told again on its page, at its league's rates", () => {
    const state = loadNewGame(1, { coachClubId: null, world: loadEurope(2026) });
    const premierLeague = state.world?.["gb-eng"]?.leagues[0]?.id ?? "";
    expect(cardRatesOfFixture(state, premierLeague)).toEqual(LEAGUE_ABROAD_CARD_RATES["gb-eng-1"]);
    expect(cardRatesOfFixture(state, "no-such-competition")).toEqual(CARD_RATES.A);
  });
});
