import { describe, expect, it } from "vitest";
import { loadClubs } from "./clubs.js";
import { loadFinances, type Finances } from "./finances.js";

const MILLION = 1_000_000;
const SIZES = ["small", "median", "large"] as const;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

describe("loadFinances", () => {
  const { clubs, divisionEstimates } = loadFinances();
  const rows: Finances[] = [...clubs, ...divisionEstimates];
  const serieARows = clubs.filter((row) => row.division === "A");

  it("has one row per Série A club, each linked to a real club id", () => {
    const serieA = loadClubs()
      .filter((club) => club.division === "A")
      .map((club) => club.id)
      .sort();
    expect(serieARows.map((row) => row.clubId).sort()).toEqual(serieA);
  });

  it("gives a row of its own only to a Série B club, once", () => {
    const serieB = new Set(loadClubs().filter((club) => club.division === "B").map((club) => club.id));
    const others = clubs.filter((row) => row.division !== "A");
    expect(others.filter((row) => row.division !== "B" || !serieB.has(row.clubId))).toEqual([]);
    expect(new Set(clubs.map((row) => row.clubId)).size).toBe(clubs.length);
  });

  // Flamengo passed R$2B in 2025, and Remo and Chapecoense earned under R$100M in Série B that year.
  it("keeps Série A revenue between R$40M and R$2.5B", () => {
    const outside = serieARows.filter((row) => row.revenue.total < 40 * MILLION || row.revenue.total > 2_500 * MILLION);
    expect(outside).toEqual([]);
  });

  it("keeps every wage bill below 1.2 times revenue", () => {
    expect(rows.filter((row) => row.wageBill >= row.revenue.total * 1.2)).toEqual([]);
  });

  it("never lets the revenue lines add up to more than the total", () => {
    const overflowing = rows.filter((row) => {
      const { total, ...lines } = row.revenue;
      return Object.values(lines).reduce((sum, value) => sum + value, 0) > total;
    });
    expect(overflowing).toEqual([]);
  });

  it("uses 2025 accounts, or 2024 when 2025 is not out", () => {
    expect(rows.filter((row) => row.season !== 2025 && row.season !== 2024)).toEqual([]);
  });

  it("gives Série B to D a small, median and large estimate, growing with size", () => {
    for (const division of ["B", "C", "D"] as const) {
      const revenue = SIZES.map(
        (size) => divisionEstimates.find((row) => row.division === division && row.size === size)?.revenue.total ?? 0,
      );
      expect(revenue[0], division).toBeGreaterThan(0);
      expect(revenue, division).toEqual([...revenue].sort((a, b) => a - b));
    }
  });

  it("never labels a division estimate as published", () => {
    expect(divisionEstimates.filter((row) => row.basis === "published")).toEqual([]);
  });

  it("makes the median club poorer in every lower division", () => {
    const medianOf = (division: string) =>
      division === "A"
        ? median(serieARows.map((row) => row.revenue.total))
        : (divisionEstimates.find((row) => row.division === division && row.size === "median")?.revenue.total ?? 0);
    const medians = ["A", "B", "C", "D"].map(medianOf);
    expect(medians).toEqual([...medians].sort((a, b) => b - a));
  });

  it("names a source for every row", () => {
    expect(rows.filter((row) => row.source.trim() === "")).toEqual([]);
  });
});
