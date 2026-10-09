import { readFileSync } from "node:fs";
import { BASES, type Basis } from "./finances.js";

type Sourced = { basis: Basis; source: string };

export type SerieATv = Sourced & {
  /** All Série A TV money for the year, in BRL. */
  totalPool: number;
  /** Simplified split of the pool; the three shares add up to 1. */
  shares: { equal: number; performance: number; audience: number };
  perClubMin: number;
  perClubMax: number;
};

export type DivisionTv = Sourced & { perClub: number };

/**
 * `prize` is what a club earns for playing that round, in BRL. In the early rounds Série C, D and
 * state-only clubs earn the smaller `prizeLowerDivisions`; when it is null everyone earns `prize`.
 */
export type CupRound = { round: string; prize: number; prizeLowerDivisions: number | null };

/** CONMEBOL pays in US dollars; `prize` is `prizeUsd` converted at `usdToBrl.rate`. */
export type ContinentalStage = { stage: string; prizeUsd: number; prize: number };

export type Matchday = Sourced & { averageTicketPrice: number; averageAttendance: number };

export type CompetitionMoney = {
  season: number;
  usdToBrl: Sourced & { rate: number };
  tv: { A: SerieATv; B: DivisionTv; C: DivisionTv; D: DivisionTv };
  copaDoBrasil: Sourced & { rounds: CupRound[] };
  libertadores: Sourced & { stages: ContinentalStage[] };
  sulAmericana: Sourced & { stages: ContinentalStage[] };
  matchday: { A: Matchday; B: Matchday; C: Matchday; D: Matchday };
};

const COMPETITION_MONEY_JSON = new URL("../../data/competition-money.json", import.meta.url);

function fail(path: string, expected: string): never {
  throw new Error(`competition-money ${path}: expected ${expected}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function field(value: unknown, key: string, path: string): unknown {
  if (!isRecord(value)) fail(path, "an object");
  return value[key];
}

function amount(value: unknown, key: string, path: string): number {
  const found = field(value, key, path);
  if (typeof found !== "number" || !Number.isFinite(found) || found < 0) fail(`${path}.${key}`, "a non-negative number");
  return found;
}

function text(value: unknown, key: string, path: string): string {
  const found = field(value, key, path);
  if (typeof found !== "string" || found.trim() === "") fail(`${path}.${key}`, "a non-empty string");
  return found;
}

function list(value: unknown, key: string, path: string): unknown[] {
  const found = field(value, key, path);
  if (!Array.isArray(found) || found.length === 0) fail(`${path}.${key}`, "a non-empty array");
  return found;
}

function sourced(value: unknown, path: string): Sourced {
  const basis = BASES.find((option) => option === field(value, "basis", path));
  if (basis === undefined) fail(`${path}.basis`, BASES.join(" | "));
  return { basis, source: text(value, "source", path) };
}

function divisionTv(value: unknown, path: string): DivisionTv {
  return { ...sourced(value, path), perClub: amount(value, "perClub", path) };
}

function matchday(value: unknown, path: string): Matchday {
  return {
    ...sourced(value, path),
    averageTicketPrice: amount(value, "averageTicketPrice", path),
    averageAttendance: amount(value, "averageAttendance", path),
  };
}

function continental(value: unknown, path: string, rate: number): Sourced & { stages: ContinentalStage[] } {
  const stages = list(value, "stages", path).map((stage, i) => {
    const prizeUsd = amount(stage, "prizeUsd", `${path}.stages[${i}]`);
    return { stage: text(stage, "stage", `${path}.stages[${i}]`), prizeUsd, prize: prizeUsd * rate };
  });
  return { ...sourced(value, path), stages };
}

function toCompetitionMoney(json: unknown): CompetitionMoney {
  const tv = field(json, "tv", "");
  const tvA = field(tv, "A", "tv");
  const shares = field(tvA, "shares", "tv.A");
  const usdToBrl = { ...sourced(field(json, "usdToBrl", ""), "usdToBrl"), rate: amount(field(json, "usdToBrl", ""), "rate", "usdToBrl") };
  const cup = field(json, "copaDoBrasil", "");
  const days = field(json, "matchday", "");
  return {
    season: amount(json, "season", ""),
    usdToBrl,
    tv: {
      A: {
        ...sourced(tvA, "tv.A"),
        totalPool: amount(tvA, "totalPool", "tv.A"),
        shares: {
          equal: amount(shares, "equal", "tv.A.shares"),
          performance: amount(shares, "performance", "tv.A.shares"),
          audience: amount(shares, "audience", "tv.A.shares"),
        },
        perClubMin: amount(tvA, "perClubMin", "tv.A"),
        perClubMax: amount(tvA, "perClubMax", "tv.A"),
      },
      B: divisionTv(field(tv, "B", "tv"), "tv.B"),
      C: divisionTv(field(tv, "C", "tv"), "tv.C"),
      D: divisionTv(field(tv, "D", "tv"), "tv.D"),
    },
    copaDoBrasil: {
      ...sourced(cup, "copaDoBrasil"),
      rounds: list(cup, "rounds", "copaDoBrasil").map((round, i) => ({
        round: text(round, "round", `copaDoBrasil.rounds[${i}]`),
        prize: amount(round, "prize", `copaDoBrasil.rounds[${i}]`),
        prizeLowerDivisions:
          field(round, "prizeLowerDivisions", `copaDoBrasil.rounds[${i}]`) === undefined
            ? null
            : amount(round, "prizeLowerDivisions", `copaDoBrasil.rounds[${i}]`),
      })),
    },
    libertadores: continental(field(json, "libertadores", ""), "libertadores", usdToBrl.rate),
    sulAmericana: continental(field(json, "sulAmericana", ""), "sulAmericana", usdToBrl.rate),
    matchday: {
      A: matchday(field(days, "A", "matchday"), "matchday.A"),
      B: matchday(field(days, "B", "matchday"), "matchday.B"),
      C: matchday(field(days, "C", "matchday"), "matchday.C"),
      D: matchday(field(days, "D", "matchday"), "matchday.D"),
    },
  };
}

/** 2026 TV money, cup and continental prizes, and 2025 ticket prices and crowds by division. */
export function loadCompetitionMoney(): CompetitionMoney {
  const json: unknown = JSON.parse(readFileSync(COMPETITION_MONEY_JSON, "utf8"));
  return toCompetitionMoney(json);
}
