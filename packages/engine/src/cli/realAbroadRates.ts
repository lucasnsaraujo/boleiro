import { readFileSync } from "node:fs";
import { parseCsv } from "@boleiro/data/csv";

const RATES_CSV = new URL("../../../../data/history/football-data/league-rates.csv", import.meta.url);

/** What real finished games of one league came to over the seasons football-data.co.uk lists; cards only where its file has them. */
export type RealLeagueRates = {
  seasons: number;
  matches: number;
  home: number;
  draw: number;
  away: number;
  goals: number;
  goalsSquared: number;
  cardMatches: number;
  yellows: number;
  reds: number;
};

/** Real league results by key (`gb-eng-1`, the country id and level), summed over the seasons in data/history/football-data/league-rates.csv. */
export function realAbroadRates(): Map<string, RealLeagueRates> {
  const rates = new Map<string, RealLeagueRates>();
  for (const row of parseCsv(readFileSync(RATES_CSV, "utf8"))) {
    const total = rates.get(row.league ?? "") ?? { seasons: 0, matches: 0, home: 0, draw: 0, away: 0, goals: 0, goalsSquared: 0, cardMatches: 0, yellows: 0, reds: 0 };
    total.seasons++;
    total.matches += Number(row.matches);
    total.home += Number(row.home);
    total.draw += Number(row.draw);
    total.away += Number(row.away);
    total.goals += Number(row.goals);
    total.goalsSquared += Number(row.goals_squared);
    total.cardMatches += Number(row.card_matches);
    total.yellows += Number(row.yellows);
    total.reds += Number(row.reds);
    rates.set(row.league ?? "", total);
  }
  return rates;
}
