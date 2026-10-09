import { readFileSync } from "node:fs";
import { parseCsv } from "../data/csv.js";
import { loadResults } from "../data/history.js";
import { CALIBRATED, matchOdds, type EngineParams, type Team } from "./match.js";

export type LeagueRates = {
  home: number;
  draw: number;
  away: number;
  goalsPerGame: number;
  homeWinP10: number;
  homeWinP90: number;
};

const HISTORY_CSV = new URL("../../data/history/brasileirao-serie-a-odds.csv", import.meta.url);
export const FIRST_CURRENT_SEASON = 2022;

function quantile(sorted: number[], q: number): number {
  return sorted[Math.round(q * (sorted.length - 1))] ?? Number.NaN;
}

export function realSerieARates(): LeagueRates {
  const games = parseCsv(readFileSync(HISTORY_CSV, "utf8")).filter(
    (g) => Number(g.Season) >= FIRST_CURRENT_SEASON && g.HG !== "" && Number(g.AvgCH) > 0,
  );
  const share = (result: string) => games.filter((g) => g.Res === result).length / games.length;
  const homeWinChances = games
    .map((g) => {
      const [h, d, a] = [g.AvgCH, g.AvgCD, g.AvgCA].map((odd) => 1 / Number(odd)) as [number, number, number];
      return h / (h + d + a);
    })
    .sort((x, y) => x - y);
  return {
    home: share("H"),
    draw: share("D"),
    away: share("A"),
    goalsPerGame: games.reduce((sum, g) => sum + Number(g.HG) + Number(g.AG), 0) / games.length,
    homeWinP10: quantile(homeWinChances, 0.1),
    homeWinP90: quantile(homeWinChances, 0.9),
  };
}

export type ResultRates = Pick<LeagueRates, "home" | "draw" | "away" | "goalsPerGame"> & { matches: number };

const DIVISION_COMPETITION = { B: "serie-b", C: "serie-c", D: "serie-d" } as const;

/** Every finished game from FIRST_CURRENT_SEASON on (Série D has only 2024); no odds exist for B–D. */
export function realDivisionRates(division: keyof typeof DIVISION_COMPETITION): ResultRates {
  const games = loadResults(DIVISION_COMPETITION[division]).filter((g) => g.season >= FIRST_CURRENT_SEASON);
  const share = (won: (g: (typeof games)[number]) => boolean) => games.filter(won).length / games.length;
  return {
    matches: games.length,
    home: share((g) => g.homeGoals > g.awayGoals),
    draw: share((g) => g.homeGoals === g.awayGoals),
    away: share((g) => g.homeGoals < g.awayGoals),
    goalsPerGame: games.reduce((sum, g) => sum + g.homeGoals + g.awayGoals, 0) / games.length,
  };
}

export function simulatedSeasonRates(teams: Team[], params: EngineParams = CALIBRATED): LeagueRates {
  const fixtures = teams.flatMap((home) => teams.filter((away) => away !== home).map((away) => matchOdds(home, away, params)));
  const mean = (pick: (o: (typeof fixtures)[number]) => number) => fixtures.reduce((sum, o) => sum + pick(o), 0) / fixtures.length;
  const homeWinChances = fixtures.map((o) => o.home).sort((x, y) => x - y);
  return {
    home: mean((o) => o.home),
    draw: mean((o) => o.draw),
    away: mean((o) => o.away),
    goalsPerGame: mean((o) => o.expectedHomeGoals + o.expectedAwayGoals),
    homeWinP10: quantile(homeWinChances, 0.1),
    homeWinP90: quantile(homeWinChances, 0.9),
  };
}
