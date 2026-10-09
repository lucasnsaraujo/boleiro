import { beforeAll, describe, expect, it } from "vitest";
import { loadFinances, type Finances } from "../data/finances.js";
import type { GameState, Tier } from "../sim/gameState.js";
import { seasonRevenues, type ClubSeason } from "./seasonRevenues.js";

const TIERS: readonly Tier[] = ["A", "B", "C", "D", "state"];
const ABOVE: Record<Tier, Tier> = { A: "A", B: "A", C: "B", D: "C", state: "D" };
const operating = (f: Finances) => f.revenue.total - f.revenue.playerSales;

// About 6 seconds, so it only runs with LONG_RUN=1 (`pnpm test:long`).
describe.skipIf(!process.env.LONG_RUN)("ten seasons of club money", () => {
  let clubSeasons: ClubSeason[] = [];
  let state: GameState | undefined;
  beforeAll(() => {
    ({ clubSeasons, state } = seasonRevenues(1, 10));
  });
  const ended = (): GameState => {
    if (!state) throw new Error("the ten seasons did not run");
    return state;
  };
  const data = loadFinances();
  const smallest = (tier: Tier) =>
    tier === "A"
      ? Math.min(...data.clubs.map(operating))
      : tier === "state"
        ? ended().economy.typicalRevenue.state
        : Math.min(...data.divisionEstimates.filter((row) => row.division === tier).map(operating));

  it("covers ten seasons for every club", () => {
    expect(clubSeasons).toHaveLength(10 * Object.keys(ended().clubs).length);
  });

  it("keeps every club's revenue between half its division's smallest and the richest of the division above", () => {
    for (const tier of TIERS) {
      const ceiling = ended().economy.revenueCeiling[ABOVE[tier]] * (tier === "A" ? 1.5 : 1);
      for (const season of clubSeasons.filter((c) => c.tier === tier)) {
        expect(season.revenue, `${season.clubId} ${season.season}`).toBeGreaterThanOrEqual(0.5 * smallest(tier));
        expect(season.revenue, `${season.clubId} ${season.season}`).toBeLessThanOrEqual(ceiling);
      }
    }
  });

  it("keeps each division's median revenue within a factor of two of its typical club", () => {
    for (const tier of TIERS.filter((t) => t !== "A")) {
      const values = clubSeasons.filter((c) => c.tier === tier).map((c) => c.revenue).sort((a, b) => a - b);
      const median = values[values.length >> 1] ?? 0;
      expect(median / ended().economy.typicalRevenue[tier]).toBeGreaterThan(0.5);
      expect(median / ended().economy.typicalRevenue[tier]).toBeLessThan(2);
    }
  });

  it("lets no club hoard more than three years of its revenue in cash", () => {
    const last = clubSeasons.filter((c) => c.season === ended().season - 1);
    for (const club of last) expect(club.cash, club.clubId).toBeLessThanOrEqual(3 * club.revenue);
  });
});
