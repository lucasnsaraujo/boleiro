import { existsSync, readFileSync } from "node:fs";
import { parseCsv } from "./csv.js";
import type { Division } from "./players.js";

export type Competition = "copa-do-brasil" | "serie-b" | "serie-c" | "serie-d";

/** Sofascore is preferred; ESPN fills the seasons Sofascore's rate limit kept us from fetching. */
export type HistorySource = "sofascore" | "espn";

export type HistoricalTeam = {
  /** Source-qualified id, e.g. "sofascore:5981". Exact within one source. */
  ref: string;
  name: string;
  /** Normalized name, e.g. "vasco-da-gama". Joins teams across sources, approximately. */
  key: string;
};

export type HistoricalMatch = {
  source: HistorySource;
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

const SOURCES: readonly HistorySource[] = ["sofascore", "espn"];
const RESULT_FILES: Record<Competition, string> = {
  "copa-do-brasil": "copa-do-brasil.csv",
  "serie-b": "brasileirao-serie-b.csv",
  "serie-c": "brasileirao-serie-c.csv",
  "serie-d": "brasileirao-serie-d.csv",
};
const DIVISIONS: readonly Division[] = ["A", "B", "C", "D"];

function readHistory(source: HistorySource, file: string): Record<string, string>[] {
  const url = new URL(`../../data/history/${source}/${file}`, import.meta.url);
  return existsSync(url) ? parseCsv(readFileSync(url, "utf8")) : [];
}

function isDivision(value: string | undefined): value is Division {
  return (DIVISIONS as readonly (string | undefined)[]).includes(value);
}

function toMatch(source: HistorySource, row: Record<string, string>): HistoricalMatch {
  return {
    source,
    season: Number(row.season),
    date: row.date ?? "",
    round: row.round ?? "",
    eventId: Number(row.event_id),
    home: { ref: `${source}:${row.home_id}`, name: row.home ?? "", key: row.home_key ?? "" },
    away: { ref: `${source}:${row.away_id}`, name: row.away ?? "", key: row.away_key ?? "" },
    homeGoals: Number(row.home_goals),
    awayGoals: Number(row.away_goals),
    penaltyWinner: row.penalty_winner === "home" || row.penalty_winner === "away" ? row.penalty_winner : null,
    odds: row.odds_home ? { home: Number(row.odds_home), draw: Number(row.odds_draw), away: Number(row.odds_away) } : null,
  };
}

/** Every finished match of a competition; a season both sources cover comes from Sofascore only. */
export function loadResults(competition: Competition): HistoricalMatch[] {
  const matches: HistoricalMatch[] = [];
  const taken = new Set<number>();
  for (const source of SOURCES) {
    const rows = readHistory(source, RESULT_FILES[competition]).map((row) => toMatch(source, row));
    const fresh = rows.filter((match) => !taken.has(match.season));
    for (const match of fresh) matches.push(match);
    for (const match of rows) taken.add(match.season);
  }
  return matches.sort((a, b) => a.season - b.season || a.date.localeCompare(b.date));
}

/** Season → team ref (see HistoricalTeam.ref) → the division that team played that season. */
export function loadDivisions(): Map<number, Map<string, Division>> {
  const seasons = new Map<number, Map<string, Division>>();
  for (const source of SOURCES) {
    for (const row of readHistory(source, "divisions.csv")) {
      if (!isDivision(row.division)) continue;
      const season = Number(row.season);
      const teams = seasons.get(season) ?? new Map<string, Division>();
      teams.set(`${source}:${row.team_id}`, row.division);
      seasons.set(season, teams);
    }
  }
  return seasons;
}
