import { readFileSync } from "node:fs";
import { parseCsv } from "./csv.js";
import type { Division } from "./players.js";

export const BASES = ["published", "estimate", "guess"] as const;
const DIVISIONS = ["A", "B", "C", "D"] as const satisfies readonly Division[];
const SIZES = ["small", "median", "large"] as const;
const FIELDS = [
  "revenue_total", "broadcasting", "matchday", "membership", "sponsorship", "player_sales", "wage_bill", "net_debt",
] as const;

export type FinanceField = (typeof FIELDS)[number];

/** `published`: from the club's accounts; `estimate`: derived from press reports; `guess`: no source found. */
export type Basis = (typeof BASES)[number];
export type ClubSize = (typeof SIZES)[number];

/** One year of a club's money, in BRL. Revenue lines are parts of `total`, which may hold lines not listed here. */
export type Finances = {
  season: number;
  revenue: {
    total: number;
    broadcasting: number;
    matchday: number;
    membership: number;
    sponsorship: number;
    playerSales: number;
  };
  wageBill: number;
  /** Negative means the club holds more cash than debt. */
  netDebt: number;
  basis: Basis;
  /** CSV columns whose value is a guess even though the row as a whole has a source. */
  guessedFields: FinanceField[];
  source: string;
};

export type ClubFinances = Finances & { clubId: string; division: Division };
export type DivisionFinances = Finances & { division: Division; size: ClubSize };

const FINANCES_CSV = new URL("../../data/finances.csv", import.meta.url);

function oneOf<T extends string>(options: readonly T[], value: string | undefined, field: string, row: string): T {
  const match = options.find((option) => option === value);
  if (match === undefined) throw new Error(`finances ${row}: invalid ${field} "${value ?? ""}"`);
  return match;
}

function money(value: string | undefined, field: string, row: string, { signed = false } = {}): number {
  const parsed = Number(value);
  if (!value || !Number.isFinite(parsed) || (!signed && parsed < 0)) {
    throw new Error(`finances ${row}: invalid ${field} "${value ?? ""}"`);
  }
  return parsed;
}

function toFinances(row: Record<string, string>, label: string): Finances {
  const source = row.source ?? "";
  if (!source) throw new Error(`finances ${label}: missing source`);
  const season = money(row.season, "season", label);
  return {
    season,
    revenue: {
      total: money(row.revenue_total, "revenue_total", label),
      broadcasting: money(row.broadcasting, "broadcasting", label),
      matchday: money(row.matchday, "matchday", label),
      membership: money(row.membership, "membership", label),
      sponsorship: money(row.sponsorship, "sponsorship", label),
      playerSales: money(row.player_sales, "player_sales", label),
    },
    wageBill: money(row.wage_bill, "wage_bill", label),
    netDebt: money(row.net_debt, "net_debt", label, { signed: true }),
    basis: oneOf(BASES, row.basis, "basis", label),
    guessedFields: (row.guessed_fields ?? "")
      .split(";")
      .filter((name) => name !== "")
      .map((name) => oneOf(FIELDS, name, "guessed_fields", label)),
    source,
  };
}

/** Série A clubs from their accounts, plus small/median/large estimates for Série B–D. Values in BRL. */
export function loadFinances(): { clubs: ClubFinances[]; divisionEstimates: DivisionFinances[] } {
  const clubs: ClubFinances[] = [];
  const divisionEstimates: DivisionFinances[] = [];
  for (const row of parseCsv(readFileSync(FINANCES_CSV, "utf8"))) {
    const label = row.club_id || `${row.division ?? ""}/${row.size ?? ""}`;
    const division = oneOf(DIVISIONS, row.division, "division", label);
    const finances = toFinances(row, label);
    if (row.club_id) clubs.push({ ...finances, clubId: row.club_id, division });
    else divisionEstimates.push({ ...finances, division, size: oneOf(SIZES, row.size, "size", label) });
  }
  return { clubs, divisionEstimates };
}
