import { describe, expect, it } from "vitest";
import { loadPack } from "@boleiro/data/dataPack";
import { loadFinances, type ClubFinances } from "@boleiro/data/finances";
import type { Division } from "@boleiro/data/players";
import type { GameState } from "../gameState.js";
import { loadNewGame, newGameFromFiles } from "../loadNewGame.js";
import { projectedRevenue } from "./setBoardBudget.js";

const yearlyWageBill = (state: GameState, clubId: string) =>
  12 * Object.values(state.players).filter((p) => p.clubId === clubId).reduce((sum, p) => sum + p.wage, 0);

describe("a new game's club finances", () => {
  const state = loadNewGame(2026, { coachClubId: "flamengo-rj" });
  const data = loadFinances();
  const serieARows = data.clubs.filter((row) => row.division === "A");
  const hasAccounts = new Set(data.clubs.map((row) => row.clubId));

  it("gives every player a positive monthly wage", () => {
    expect(Object.values(state.players).every((p) => p.wage > 0)).toBe(true);
  });

  it("matches each Série A club's wage bill to its 2025 accounts", () => {
    for (const row of serieARows) {
      expect(yearlyWageBill(state, row.clubId) / row.wageBill).toBeCloseTo(1, 2);
    }
  });

  it("keeps the wage bills of Série B–D clubs without accounts between the small and large club estimates", () => {
    for (const division of ["B", "C", "D"] satisfies Division[]) {
      const rows = data.divisionEstimates.filter((row) => row.division === division).map((row) => row.wageBill);
      for (const club of Object.values(state.clubs).filter((c) => c.division === division && !hasAccounts.has(c.id))) {
        const bill = yearlyWageBill(state, club.id);
        expect(bill).toBeGreaterThanOrEqual(Math.min(...rows) * 0.99);
        expect(bill).toBeLessThanOrEqual(Math.max(...rows) * 1.01);
      }
    }
  });

  it("pays each Série B club with accounts their wage share of what it can earn, never more than their bill", () => {
    const serieBRows = data.clubs.filter((row) => row.division === "B");
    expect(serieBRows.length).toBeGreaterThan(0);
    for (const row of serieBRows) {
      const finance = state.finances[row.clubId];
      if (!finance) throw new Error(`no finances for ${row.clubId}`);
      const share = row.wageBill / (row.revenue.total - row.revenue.playerSales);
      const expected = Math.min(row.wageBill, share * projectedRevenue(finance));
      expect(yearlyWageBill(state, row.clubId) / expected, row.clubId).toBeCloseTo(1, 2);
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
    for (const row of serieARows) {
      const finance = state.finances[row.clubId];
      if (!finance) throw new Error(`no finances for ${row.clubId}`);
      const projected = finance.tv + finance.sponsorship + finance.membership + finance.otherIncome + finance.expectedTickets + finance.expectedPrizes;
      expect(projected).toBeGreaterThanOrEqual((row.revenue.total - row.revenue.playerSales) * 0.99);
    }
  });

  it("counts the Copa do Brasil prizes a Série A club expects once, inside its 2025 revenue", () => {
    for (const row of serieARows) {
      const finance = state.finances[row.clubId];
      if (!finance || finance.otherIncome === 0) continue;
      expect(finance.expectedPrizes, row.clubId).toBeGreaterThan(0);
      const projected = finance.tv + finance.sponsorship + finance.membership + finance.otherIncome + finance.expectedTickets + finance.expectedPrizes;
      expect(projected, row.clubId).toBeLessThanOrEqual((row.revenue.total - row.revenue.playerSales) * 1.01);
    }
  });

  it("sets a transfer budget and a wage cap that grow with revenue", () => {
    const flamengo = state.finances["flamengo-rj"];
    const mirassol = state.finances["mirassol-sp"];
    expect(flamengo?.wageCap ?? 0).toBeGreaterThan(mirassol?.wageCap ?? 0);
    expect(flamengo?.transferBudget ?? 0).toBeGreaterThan(mirassol?.transferBudget ?? 0);
  });

  describe("a Série B club with its own accounts", () => {
    const pack = loadPack();
    const club = pack.clubs.find((c) => c.division === "B");
    if (!club) throw new Error("no Série B club");
    // A relegated club's books: Série A TV and crowds it no longer earns.
    const row: ClubFinances = {
      clubId: club.id, division: "B", season: 2025, basis: "published", guessedFields: [], source: "test accounts",
      revenue: { total: 400_000_000, broadcasting: 150_000_000, matchday: 50_000_000, membership: 20_000_000, sponsorship: 60_000_000, playerSales: 70_000_000 },
      wageBill: 180_000_000, netDebt: 250_000_000,
    };
    const withRow = (accounts: ClubFinances) =>
      newGameFromFiles(2026, { coachClubId: null }, { ...pack, finances: { ...pack.finances, clubs: [...pack.finances.clubs, accounts] } });
    const game = withRow(row);
    const finance = game.finances[club.id];
    const projected = finance ? projectedRevenue(finance) : 0;

    it("opens on its accounts' debt, sponsorship and membership", () => {
      expect(finance?.legacyDebt).toBe(row.netDebt);
      expect(finance?.sponsorship).toBe(row.revenue.sponsorship);
      expect(finance?.membership).toBe(row.revenue.membership);
    });

    it("earns its division's TV and gates in place of the ones its accounts show", () => {
      expect(finance?.tv).toBe(game.economy.tvPerClub.B);
      const { total, playerSales, broadcasting, matchday, membership, sponsorship } = row.revenue;
      expect(finance?.otherIncome).toBe(total - playerSales - broadcasting - matchday - membership - sponsorship);
    });

    it("keeps the Copa prizes its accounts' broadcasting held as prizes it expects, counted once", () => {
      expect(finance?.expectedPrizes).toBeGreaterThan(0);
      expect(finance?.prizesOutOfOtherIncome).toBe(finance?.expectedPrizes);
    });

    it("opens with a month of the revenue it can earn in its division in the bank", () => {
      expect(finance?.cash).toBe(Math.round(projected / 12));
    });

    it("pays its accounts' share of revenue in wages, on what it can earn in its division", () => {
      const share = row.wageBill / (row.revenue.total - row.revenue.playerSales);
      expect(projected).toBeLessThan(row.revenue.total - row.revenue.playerSales);
      expect(yearlyWageBill(game, club.id) / (share * projected)).toBeCloseTo(1, 2);
    });

    it("keeps its accounts' wage bill when its division earns it more than its accounts show", () => {
      const small: ClubFinances = {
        ...row,
        revenue: { total: 12_000_000, broadcasting: 2_000_000, matchday: 1_000_000, membership: 500_000, sponsorship: 1_500_000, playerSales: 1_000_000 },
        wageBill: 9_000_000,
      };
      expect(yearlyWageBill(withRow(small), club.id) / small.wageBill).toBeCloseTo(1, 2);
    });

    it("leaves Série A's typical and richest revenue to Série A's accounts", () => {
      expect(game.economy.typicalRevenue).toEqual(state.economy.typicalRevenue);
      expect(game.economy.revenueCeiling).toEqual(state.economy.revenueCeiling);
    });
  });
});
