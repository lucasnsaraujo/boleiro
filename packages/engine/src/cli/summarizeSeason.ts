import type { Division } from "@boleiro/data/players";
import type { Tier } from "../sim/gameState.js";
import { standings } from "../sim/standings.js";
import type { SeasonPlay } from "./playSeason.js";
import { clubSeasonsOf } from "./seasonRevenues.js";

export type TableRow = { name: string; points: number | null };
export type MoneyBand = { tier: Tier; clubs: number; p10: number; median: number; p90: number };
/** `cash` is net of board loans. */
export type ClubCash = { name: string; tier: Tier; cash: number };

export type SeasonSummary = {
  season: number;
  /** Final order, champion first; points only for the single-table Série A and B. */
  tables: Record<Division, TableRow[]>;
  cupWinner: string | null;
  estaduais: { state: string; champion: string }[];
  /** Keyed by the division the clubs leave, as in the history. */
  promoted: Record<Division, string[]>;
  relegated: Record<Division, string[]>;
  topTransfers: { name: string; from: string; to: string; fee: number }[];
  /** Revenue without player sales, per club, in BRL. */
  money: MoneyBand[];
  richest: ClubCash[];
  poorest: ClubCash[];
};

const TIERS: readonly Tier[] = ["A", "B", "C", "D", "state"];
const TOP_TRANSFERS = 5;
const RICH_AND_POOR = 3;

const quantile = (sorted: readonly number[], q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;

/** What a season ended with: tables, winners, movements, the biggest transfers and the clubs' money. */
export function summarizeSeason({ before, after, fixtures, transfers }: SeasonPlay): SeasonSummary {
  const record = after.history.seasons.at(-1);
  if (record?.season !== before.season) throw new Error(`season ${before.season} was not filed in the history`);
  const nameOf = (id: string | null) => (id === null ? "abroad" : (before.clubs[id]?.shortName ?? id));
  const pointsOf = (division: Division): Map<string, number> => {
    const league = Object.values(before.competitions).find((c) => c.kind === "league" && c.division === division);
    if (!league || division === "C" || division === "D") return new Map();
    const own = fixtures.filter((f) => f.competitionId === league.id);
    return new Map(standings(league.clubIds, own, league.drawOrder).map((row) => [row.clubId, row.points]));
  };
  const tableOf = (division: Division): TableRow[] => {
    const points = pointsOf(division);
    return record.tables[division].map((id) => ({ name: nameOf(id), points: points.get(id) ?? null }));
  };
  const estaduais = Object.entries(record.champions)
    .flatMap(([key, id]) => (key.startsWith("state-") ? [{ state: key.slice(6).toUpperCase(), champion: nameOf(id) }] : []))
    .sort((a, b) => a.state.localeCompare(b.state));
  const clubSeasons = clubSeasonsOf(before, after);
  const money = TIERS.map((tier) => {
    const values = clubSeasons.filter((c) => c.tier === tier).map((c) => c.revenue).sort((a, b) => a - b);
    return { tier, clubs: values.length, p10: quantile(values, 0.1), median: quantile(values, 0.5), p90: quantile(values, 0.9) };
  });
  const byCash = clubSeasons.map((c) => ({ name: nameOf(c.clubId), tier: c.tier, cash: c.cash - c.loans })).sort((a, b) => b.cash - a.cash);
  const names = (ids: readonly string[]) => ids.map(nameOf);
  return {
    season: before.season,
    tables: { A: tableOf("A"), B: tableOf("B"), C: tableOf("C"), D: tableOf("D") },
    cupWinner: record.champions["copa-do-brasil"] ? nameOf(record.champions["copa-do-brasil"]) : null,
    estaduais,
    promoted: { A: names(record.promoted.A), B: names(record.promoted.B), C: names(record.promoted.C), D: names(record.promoted.D) },
    relegated: { A: names(record.relegated.A), B: names(record.relegated.B), C: names(record.relegated.C), D: names(record.relegated.D) },
    topTransfers: [...transfers]
      .sort((a, b) => b.fee - a.fee)
      .slice(0, TOP_TRANSFERS)
      .map((t) => ({ name: t.name, from: nameOf(t.fromId), to: nameOf(t.toId), fee: t.fee })),
    money,
    richest: byCash.slice(0, RICH_AND_POOR),
    poorest: byCash.slice(-RICH_AND_POOR).reverse(),
  };
}
