import { describe, expect, it } from "vitest";
import { FIRST_PACK_VERSION, loadPack } from "@boleiro/data/dataPack";
import { advanceDay } from "./advanceDay.js";
import { renewFinances } from "./finances/renewFinances.js";
import { projectedRevenue } from "./finances/setBoardBudget.js";
import type { GameState } from "./gameState.js";
import { loadNewGame } from "./loadNewGame.js";
import { loadGame, saveGame } from "./saveGame.js";

const playDays = (state: GameState, days: number) => {
  let current = state;
  for (let i = 0; i < days; i++) current = advanceDay(current, {}).state;
  return current;
};

describe("saveGame and loadGame", () => {
  const midSeason = playDays(loadNewGame(1, { coachClubId: "flamengo-rj" }), 200);

  it("round-trips the state exactly", () => {
    expect(Object.values(midSeason.discipline).some((records) => Object.values(records).some((r) => r.bans > 0 || r.yellows > 0))).toBe(true);
    expect(loadGame(saveGame(midSeason))).toStrictEqual(midSeason);
  });

  it("continues a loaded save exactly like the original", () => {
    const original = playDays(midSeason, 60);
    const resumed = playDays(loadGame(saveGame(midSeason)), 60);
    expect(resumed).toEqual(original);
    expect(resumed.fixtures.filter((f) => f.result).length).toBeGreaterThan(midSeason.fixtures.filter((f) => f.result).length);
  });

  it("writes each player's strength marks as one line: his first season, then his strength each season on", () => {
    const [id, marks] = Object.entries(midSeason.history.strength)[0] ?? [];
    if (!id || !marks?.[0]) throw new Error("no strength marks");
    const twoSeasons = { ...midSeason, history: { ...midSeason.history, strength: { ...midSeason.history.strength, [id]: [{ season: 2025, strength: 70.5 }, { season: 2026, strength: 71 }] } } };
    expect(JSON.parse(saveGame(twoSeasons)).history.strength[id]).toEqual([2025, 70.5, 71]);
  });

  it("leaves a gap in a line for a season without a mark, and reads every mark back", () => {
    const [id] = Object.keys(midSeason.history.strength);
    if (!id) throw new Error("no strength marks");
    const marks = [{ season: 2024, strength: 66 }, { season: 2026, strength: 70.1 }];
    const withGap = { ...midSeason, history: { ...midSeason.history, strength: { ...midSeason.history.strength, [id]: marks } } };
    expect(JSON.parse(saveGame(withGap)).history.strength[id]).toEqual([2024, 66, null, 70.1]);
    expect(loadGame(saveGame(withGap)).history.strength[id]).toStrictEqual(marks);
  });

  it("reads a save that wrote strength marks one by one, as saves did before lines", () => {
    expect(loadGame(JSON.stringify(midSeason))).toStrictEqual(midSeason);
  });

  it("keeps the data pack the career started with", () => {
    expect(loadGame(saveGame(midSeason)).packVersion).toBe(loadPack().packVersion);
  });

  it("reads a save from before data packs as a career on the first Brazil pack", () => {
    const old: Partial<GameState> = { ...midSeason };
    delete old.packVersion;
    expect(loadGame(JSON.stringify(old)).packVersion).toBe(FIRST_PACK_VERSION);
  });

  it("reads a save whose pack version is not text as a career on the first Brazil pack", () => {
    expect(loadGame(JSON.stringify({ ...midSeason, packVersion: null })).packVersion).toBe(FIRST_PACK_VERSION);
  });

  it("writes a save from before data packs back out byte for byte like a new save on the first pack", () => {
    const old: Partial<GameState> = { ...midSeason };
    delete old.packVersion;
    expect(saveGame(loadGame(JSON.stringify(old)))).toBe(saveGame({ ...midSeason, packVersion: FIRST_PACK_VERSION }));
  });

  it("reads a save from before friendlies and title bonuses with those ledger lines at zero", () => {
    const finances = Object.fromEntries(Object.entries(midSeason.finances).map(([id, finance]) => {
      const revenue: Partial<typeof finance.month.revenue> = { ...finance.month.revenue };
      const costs: Partial<typeof finance.month.costs> = { ...finance.month.costs };
      delete revenue.friendlies;
      delete costs.friendlies;
      delete costs.bonuses;
      return [id, { ...finance, month: { ...finance.month, revenue, costs } }];
    }));
    const loaded = loadGame(JSON.stringify({ ...midSeason, finances }));
    expect(loaded.finances["flamengo-rj"]?.month.revenue.friendlies).toBe(0);
    expect(loaded.finances["flamengo-rj"]?.month.costs.bonuses).toBe(0);
    expect(loaded).toStrictEqual(midSeason);
  });

  it("reads a save from before revenue floors with one, so a poor club promoted after loading earns what Série C's poorest does", () => {
    const economy: Partial<GameState["economy"]> = { ...midSeason.economy };
    delete economy.revenueFloor;
    const loaded = loadGame(JSON.stringify({ ...midSeason, economy }));
    const revenueOf = (finances: GameState["finances"], id: string) => {
      const finance = finances[id];
      if (!finance) throw new Error(`no finances for ${id}`);
      return projectedRevenue(finance);
    };
    const idsIn = (division: "C" | "D") => Object.values(loaded.clubs).filter((c) => c.division === division && !c.abroad).map((c) => c.id);
    const [poorest] = idsIn("D").sort((a, b) => revenueOf(loaded.finances, a) - revenueOf(loaded.finances, b));
    const club = poorest ? loaded.clubs[poorest] : undefined;
    if (!poorest || !club) throw new Error("no Série D club");
    const renewed = renewFinances(loaded, { ...loaded.clubs, [poorest]: { ...club, division: "C" } }, loaded.competitions, loaded.fixtures, []);
    expect(revenueOf(renewed, poorest)).toBeGreaterThanOrEqual(Math.min(...idsIn("C").map((id) => revenueOf(loaded.finances, id))));
  });

  it("rejects a save from another version", () => {
    expect(() => loadGame(JSON.stringify({ ...midSeason, version: 99 }))).toThrow();
  });

  it("rejects a save from before coach tactics existed", () => {
    const coachWithoutTactics: Partial<typeof midSeason.coach> = { ...midSeason.coach };
    delete coachWithoutTactics.tactics;
    expect(() => loadGame(JSON.stringify({ ...midSeason, version: 1, coach: coachWithoutTactics }))).toThrow();
  });

  it("rejects a save from before strength history existed", () => {
    const historyWithoutStrength: Partial<typeof midSeason.history> = { ...midSeason.history };
    delete historyWithoutStrength.strength;
    expect(() => loadGame(JSON.stringify({ ...midSeason, version: 2, history: historyWithoutStrength }))).toThrow();
  });

  it("rejects a save from before clubs kept their last monthly closing", () => {
    const finances = Object.fromEntries(Object.entries(midSeason.finances).map(([id, finance]) => {
      const old: Partial<typeof finance> = { ...finance };
      delete old.lastClosing;
      return [id, old];
    }));
    expect(() => loadGame(JSON.stringify({ ...midSeason, version: 3, finances }))).toThrow();
  });
});
