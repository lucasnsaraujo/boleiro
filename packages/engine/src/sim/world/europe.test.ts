import { loadWorldPack } from "@boleiro/data/worldPack";
import { describe, expect, it } from "vitest";
import { EUROPE, europeStart } from "./europe.js";
import { checkSquad } from "./resultOnlyLeague.js";
import { startCountry } from "./resultOnlyWorld.js";

const start = europeStart(EUROPE.map((structure) => loadWorldPack(structure.id)), 2026);

describe("Europe's result-only countries", () => {
  it("are the 25 countries with a club in the 2026/27 Champions League or Europa League phase, each with its second division but Azerbaijan", () => {
    expect(start).toHaveLength(25);
    for (const country of start) expect(country.levels).toHaveLength(country.structure.id === "az" ? 1 : 2);
    expect(start.find((c) => c.structure.id === "gb-eng")?.levels.map((level) => level.length)).toEqual([20, 24]);
  });

  it("send 36 clubs to each league phase between them", () => {
    const sum = (key: "championsLeague" | "europaLeague") => EUROPE.reduce((total, s) => total + (s.uefa?.[key] ?? 0), 0);
    expect(sum("championsLeague")).toBe(36);
    expect(sum("europaLeague")).toBe(36);
  });

  it("start as pyramids the result-only tier can play, with their cups", () => {
    for (const { structure, levels } of start) {
      expect(() => startCountry(structure, levels, 2026, 1)).not.toThrow();
      expect(structure.hasCup).toBe(true);
    }
    for (const club of start.flatMap((country) => country.levels.flat())) expect(() => checkSquad(club)).not.toThrow();
  });

  it("play August to May, but Norway, whose season is the calendar year", () => {
    for (const { structure } of start) {
      if (structure.id === "no") expect(structure.rollover).toBeUndefined();
      else expect(structure.rollover).toBe("07-01");
    }
  });

  it("rate Real Madrid's eleven above Slovan Bratislava's", () => {
    const clubs = start.flatMap((country) => country.levels.flat());
    const bestEleven = (id: string) => {
      const club = clubs.find((c) => c.id === id);
      return [...(club?.strengths ?? [])].sort((a, b) => b - a).slice(0, 11).reduce((sum, s) => sum + s, 0) / 11;
    };
    expect(bestEleven("tm-418")).toBeGreaterThan(bestEleven("tm-540") + 5);
  });
});
