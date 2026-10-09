import { beforeAll, describe, expect, it } from "vitest";
import type { Tier } from "../sim/gameState.js";
import { strengthBySeason, type StrengthBand } from "./strengthBySeason.js";

const TIERS: readonly Tier[] = ["A", "B", "C", "D"];

// About 9 seconds, so it only runs with LONG_RUN=1 (`pnpm test:long`).
describe.skipIf(!process.env.LONG_RUN)("ten seasons of player strength", () => {
  let bands: StrengthBand[] = [];
  beforeAll(() => {
    ({ bands } = strengthBySeason(1, 10));
  }, 60_000);
  const band = (season: number, tier: Tier) => {
    const found = bands.find((b) => b.season === season && b.tier === tier);
    if (!found) throw new Error(`no ${tier} band in ${season}`);
    return found;
  };
  const first = () => Math.min(...bands.map((b) => b.season));
  const last = () => Math.max(...bands.map((b) => b.season));

  it("keeps each division's mean strength within 3 points of where it started", () => {
    for (const tier of ["A", "B", "C"] as const) expect(Math.abs(band(last(), tier).mean - band(first(), tier).mean), tier).toBeLessThan(3);
  });

  // Each year about two thirds of Série D are replaced by estadual qualifiers (serieDQualifiers.ts),
  // many of them state-only clubs whose players start near 42.
  it("keeps Série D's mean strength within 4 points while its clubs churn", () => {
    expect(Math.abs(band(last(), "D").mean - band(first(), "D").mean)).toBeLessThan(4);
  });

  it("keeps the divisions in order, at least 5 points apart", () => {
    for (let season = first(); season <= last(); season++) {
      const means = TIERS.map((tier) => band(season, tier).mean);
      means.slice(1).forEach((mean, i) => expect((means[i] ?? 0) - mean, `${season}`).toBeGreaterThan(5));
    }
  });

  it("stops the spread from growing once the first season has mixed the squads", () => {
    for (const tier of TIERS) {
      const spread = (season: number) => band(season, tier).p90 - band(season, tier).p10;
      expect(spread(last()), tier).toBeLessThan(spread(first() + 1) + 2);
      expect(spread(last()), tier).toBeGreaterThan(spread(first()) - 2);
    }
  });

  it("keeps the mean age steady", () => {
    for (const tier of TIERS) expect(Math.abs(band(last(), tier).meanAge - band(first(), tier).meanAge), tier).toBeLessThan(1.5);
  });
});
