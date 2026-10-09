import { describe, expect, it } from "vitest";
import { loadFinances } from "../../data/finances.js";
import type { Division } from "../../data/players.js";
import type { GameState } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";

const yearlyWageBill = (state: GameState, clubId: string) =>
  12 * Object.values(state.players).filter((p) => p.clubId === clubId).reduce((sum, p) => sum + p.wage, 0);

describe("a new game's club finances", () => {
  const state = loadNewGame(2026, { coachClubId: "flamengo-rj" });
  const data = loadFinances();

  it("gives every player a positive monthly wage", () => {
    expect(Object.values(state.players).every((p) => p.wage > 0)).toBe(true);
  });

  it("matches each Série A club's wage bill to its 2025 accounts", () => {
    for (const row of data.clubs) {
      expect(yearlyWageBill(state, row.clubId) / row.wageBill).toBeCloseTo(1, 2);
    }
  });

  it("keeps Série B–D wage bills between the small and large club estimates", () => {
    for (const division of ["B", "C", "D"] satisfies Division[]) {
      const rows = data.divisionEstimates.filter((row) => row.division === division).map((row) => row.wageBill);
      for (const club of Object.values(state.clubs).filter((c) => c.division === division)) {
        const bill = yearlyWageBill(state, club.id);
        expect(bill).toBeGreaterThanOrEqual(Math.min(...rows) * 0.99);
        expect(bill).toBeLessThanOrEqual(Math.max(...rows) * 1.01);
      }
    }
  });

  it("pays the stronger players more inside a squad", () => {
    const squad = Object.values(state.players).filter((p) => p.clubId === "palmeiras-sp").sort((a, b) => a.strength - b.strength);
    expect(squad.at(-1)?.wage ?? 0).toBeGreaterThan(squad[0]?.wage ?? 0);
  });

  it("splits Série A TV money so most of the pool is paid out and bigger clubs earn more", () => {
    const serieA = Object.values(state.clubs).filter((c) => c.division === "A").map((c) => state.finances[c.id]?.tv ?? 0);
    const paidOut = serieA.reduce((sum, tv) => sum + tv, 0) / state.economy.serieATv.pool;
    expect(paidOut).toBeGreaterThan(0.9);
    expect(paidOut).toBeLessThan(1.05);
    expect(Math.min(...serieA)).toBeGreaterThanOrEqual(state.economy.serieATv.perClubMin);
    expect(Math.max(...serieA)).toBeLessThanOrEqual(state.economy.serieATv.perClubMax);
    expect(state.finances["flamengo-rj"]?.tv ?? 0).toBeGreaterThan(state.finances["mirassol-sp"]?.tv ?? 0);
  });

  it("pays Série B–D clubs the flat 2026 TV money of their division", () => {
    const serieC = Object.values(state.clubs).find((c) => c.division === "C");
    expect(state.finances[serieC?.id ?? ""]?.tv).toBe(1_550_000);
  });

  it("starts each Série A club's yearly revenue near its 2025 accounts without player sales", () => {
    for (const row of data.clubs) {
      const finance = state.finances[row.clubId];
      if (!finance) throw new Error(`no finances for ${row.clubId}`);
      const projected = finance.tv + finance.sponsorship + finance.membership + finance.otherIncome + finance.expectedTickets;
      expect(projected).toBeGreaterThanOrEqual((row.revenue.total - row.revenue.playerSales) * 0.99);
    }
  });

  it("sets a transfer budget and a wage cap that grow with revenue", () => {
    const flamengo = state.finances["flamengo-rj"];
    const mirassol = state.finances["mirassol-sp"];
    expect(flamengo?.wageCap ?? 0).toBeGreaterThan(mirassol?.wageCap ?? 0);
    expect(flamengo?.transferBudget ?? 0).toBeGreaterThan(mirassol?.transferBudget ?? 0);
  });
});
