import { describe, expect, it } from "vitest";
import { cupStageDates } from "./continental/conmebolCups.js";
import { RAPIDO } from "./formats.js";
import type { Competition, ContinentalCup, IsoDate, LeagueFormatId } from "./gameState.js";
import { hasExtraTime, tieBreakOf } from "./tieBreaks.js";
import { tieResults } from "./tieResults.js";

const base = { season: 2026, clubIds: [], stages: [], drawOrder: [] };
const continental = (cup: ContinentalCup, stageDates: IsoDate[][] = cupStageDates(cup, 2026)): Competition => ({ ...base, id: cup, kind: "continental", cup, entries: [], countries: {}, stageDates });
const league = (format: LeagueFormatId, stages: number): Competition => ({ ...base, id: format, kind: "league", format, division: null, stageDates: Array.from({ length: stages }, () => ["2026-05-01"]) });
const COPA_DO_BRASIL_LEGS = [1, 1, 1, 1, 2, 2, 2, 2, 1];
const copaDoBrasil = (legs: readonly number[] = COPA_DO_BRASIL_LEGS): Competition => ({
  ...base,
  id: "copa-do-brasil",
  kind: "cup",
  entries: [],
  stageDates: legs.map((count) => Array.from({ length: count }, (_, i) => `2026-0${i + 3}-01`)),
});

describe("a level tie's tie-break, as each real competition settles it", () => {
  it("plays extra time in every match of the Intercontinental Cup and the Recopa", () => {
    for (let stage = 0; stage < 5; stage++) expect(tieBreakOf(continental("intercontinental-cup"), stage)).toBe("extraTime");
    expect(tieBreakOf(continental("recopa"), 0)).toBe("extraTime");
  });

  it("plays extra time in the Club World Cup's knockout rounds", () => {
    for (let stage = 1; stage < 5; stage++) expect(tieBreakOf(continental("club-world-cup"), stage)).toBe("extraTime");
  });

  it("sends the Libertadores' and Sul-Americana's two-legged ties straight to penalties and plays extra time in their finals", () => {
    const libertadores = continental("libertadores");
    expect([0, 1, 2, 4, 5, 6].map((stage) => tieBreakOf(libertadores, stage))).toEqual(Array(6).fill("penalties"));
    expect(tieBreakOf(libertadores, 7)).toBe("extraTime");
    const sulAmericana = continental("sul-americana");
    expect([0, 2, 3, 4, 5].map((stage) => tieBreakOf(sulAmericana, stage))).toEqual(Array(5).fill("penalties"));
    expect(tieBreakOf(sulAmericana, 6)).toBe("extraTime");
  });

  it("plays a two-legged round the game's formats make one match by the competition's final rule", () => {
    const libertadores = continental("libertadores", cupStageDates("libertadores", 2026, RAPIDO));
    expect(tieBreakOf(libertadores, 4)).toBe("extraTime");
    expect(tieBreakOf(libertadores, 5)).toBe("penalties");
    expect(tieBreakOf(continental("sul-americana", cupStageDates("sul-americana", 2026, RAPIDO)), 0)).toBe("penalties");
    expect(tieBreakOf(copaDoBrasil([1, 1, 1, 1, 1, 1, 2, 2, 1]), 5)).toBe("extraTime");
  });

  it("sends the Copa do Brasil's ties to penalties and plays extra time in its one-match final", () => {
    const cup = copaDoBrasil();
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((stage) => tieBreakOf(cup, stage))).toEqual(Array(8).fill("penalties"));
    expect(tieBreakOf(cup, 8)).toBe("extraTime");
  });

  it("sends a state championship's ties to penalties", () => {
    const state: Competition = { ...base, id: "paulista", kind: "state", state: "SP", stageDates: [["2026-01-10"], ["2026-02-01", "2026-02-08"]] };
    expect(tieBreakOf(state, 1)).toBe("penalties");
  });

  it("sends MLS's first play-off round straight to penalties and plays extra time from the conference semi-finals on", () => {
    const mls = league("mls", 5);
    expect(tieBreakOf(mls, 1)).toBe("penalties");
    expect([2, 3, 4].map((stage) => tieBreakOf(mls, stage))).toEqual(Array(3).fill("extraTime"));
  });

  it("sends the better seed through a level liguilla tie and plays extra time in each tournament's final", () => {
    const ligaMx = league("liga-mx", 8);
    expect([1, 2, 5, 6].map((stage) => tieBreakOf(ligaMx, stage))).toEqual(Array(4).fill("betterSeed"));
    expect([3, 7].map((stage) => tieBreakOf(ligaMx, stage))).toEqual(["extraTime", "extraTime"]);
  });

  it("plays extra time only in a tie's last leg", () => {
    const final = copaDoBrasil();
    expect(hasExtraTime(final, 8, 0)).toBe(true);
    const recopa = continental("recopa");
    expect(hasExtraTime(recopa, 0, 0)).toBe(false);
    expect(hasExtraTime(recopa, 0, 1)).toBe(true);
    expect(hasExtraTime(copaDoBrasil(), 7, 1)).toBe(false);
  });
});

describe("a tie level on aggregate with no shootout", () => {
  it("sends the better seed, listed first, through", () => {
    const leg = (id: string, homeId: string, awayId: string, homeGoals: number, awayGoals: number) => ({ id, competitionId: "liga-mx", stage: 1, date: "2026-05-01", homeId, awayId, tie: 0, result: { homeGoals, awayGoals } });
    const results = tieResults({ kind: "knockout", ties: [["first", "eighth"]], dates: ["2026-05-01", "2026-05-08"] }, [leg("a", "eighth", "first", 2, 1), leg("b", "first", "eighth", 1, 0)]);
    expect(results).toEqual([{ winnerId: "first", loserId: "eighth" }]);
  });
});
