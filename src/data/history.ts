import { readFileSync } from "node:fs";
import { parseCsv } from "./csv.js";
import type { Division } from "./players.js";

export type Competition = "copa-do-brasil" | "serie-b" | "serie-c" | "serie-d";

export type HistoricalTeam = { id: number; name: string };

export type HistoricalMatch = {
  season: number;
  date: string;
  round: string;
  eventId: number;
  home: HistoricalTeam;
  away: HistoricalTeam;
  homeGoals: number;
  awayGoals: number;
  penaltyWinner: "home" | "away" | null;
  odds: { home: number; draw: number; away: number } | null;
};

const RESULT_FILES: Record<Competition, string> = {
  "copa-do-brasil": "copa-do-brasil.csv",
  "serie-b": "brasileirao-serie-b.csv",
  "serie-c": "brasileirao-serie-c.csv",
  "serie-d": "brasileirao-serie-d.csv",
};
const DIVISIONS: readonly Division[] = ["A", "B", "C", "D"];

function readHistory(file: string): Record<string, string>[] {
  return parseCsv(readFileSync(new URL(`../../data/history/${file}`, import.meta.url), "utf8"));
}

function isDivision(value: string | undefined): value is Division {
  return (DIVISIONS as readonly (string | undefined)[]).includes(value);
}

export function loadResults(competition: Competition): HistoricalMatch[] {
  return readHistory(RESULT_FILES[competition]).map((row) => ({
    season: Number(row.season),
    date: row.date ?? "",
    round: row.round ?? "",
    eventId: Number(row.event_id),
    home: { id: Number(row.home_id), name: row.home ?? "" },
    away: { id: Number(row.away_id), name: row.away ?? "" },
    homeGoals: Number(row.home_goals),
    awayGoals: Number(row.away_goals),
    penaltyWinner: row.penalty_winner === "home" || row.penalty_winner === "away" ? row.penalty_winner : null,
    odds: row.odds_home ? { home: Number(row.odds_home), draw: Number(row.odds_draw), away: Number(row.odds_away) } : null,
  }));
}

/** Season → Sofascore team id → the division that team played that season. */
export function loadDivisions(): Map<number, Map<number, Division>> {
  const seasons = new Map<number, Map<number, Division>>();
  for (const row of readHistory("divisions.csv")) {
    if (!isDivision(row.division)) continue;
    const season = Number(row.season);
    const teams = seasons.get(season) ?? new Map<number, Division>();
    teams.set(Number(row.team_id), row.division);
    seasons.set(season, teams);
  }
  return seasons;
}
