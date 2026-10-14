import { describe, expect, it } from "vitest";
import { FIRST_PACK_VERSION, loadPack } from "@boleiro/data/dataPack";
import { advanceDay } from "./advanceDay.js";
import type { GameState } from "./gameState.js";
import { loadNewGame } from "./loadNewGame.js";
import { loadGame, saveGame } from "./saveGame.js";

const playDays = (state: GameState, days: number) => {
  let current = state;
  for (let i = 0; i < days; i++) current = advanceDay(current, {}).state;
  return current;
};

describe("saveGame and loadGame", () => {
  const midSeason = playDays(loadNewGame(3, { coachClubId: "flamengo-rj" }), 200);

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
