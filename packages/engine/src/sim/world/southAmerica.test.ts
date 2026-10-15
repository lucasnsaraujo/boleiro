import { loadWorldPack } from "@boleiro/data/worldPack";
import { describe, expect, it } from "vitest";
import { checkSquad } from "./resultOnlyLeague.js";
import { SOUTH_AMERICA, southAmericaStart } from "./southAmerica.js";

const packs = SOUTH_AMERICA.map((structure) => loadWorldPack(structure.id));
const start = southAmericaStart(packs, 2026, 1);

describe("South America's result-only countries", () => {
  it("are the nine CONMEBOL countries besides Brazil, Argentina with its second division", () => {
    expect(start.map((country) => [country.structure.id, country.levels.map((level) => level.length)])).toEqual([
      ["ar", [30, 36]],
      ["bo", [16]],
      ["cl", [16]],
      ["co", [20]],
      ["ec", [16]],
      ["pe", [18]],
      ["py", [12]],
      ["uy", [16]],
      ["ve", [15]],
    ]);
  });

  it("give every club a squad the score draw can play, named player by player", () => {
    const clubs = start.flatMap((country) => country.levels.flat());
    for (const club of clubs) expect(() => checkSquad(club)).not.toThrow();
    expect(clubs.every((club) => club.names?.length === club.strengths.length)).toBe(true);
  });

  it("rate River Plate's eleven above a Venezuelan club's", () => {
    const clubs = start.flatMap((country) => country.levels.flat());
    const bestEleven = (name: string) => {
      const club = clubs.find((c) => c.name === name);
      return [...(club?.strengths ?? [])].sort((a, b) => b - a).slice(0, 11).reduce((sum, s) => sum + s, 0) / 11;
    };
    expect(bestEleven("CA River Plate")).toBeGreaterThan(bestEleven("Metropolitanos FC") + 5);
  });

  it("gives each country the continental places CONMEBOL allots it", () => {
    const placesOf = (id: string) => SOUTH_AMERICA.find((s) => s.id === id)?.continental.map((slot) => [slot.entry, slot.places]);
    expect(placesOf("ar")).toEqual([["libertadoresGroups", 5], ["libertadoresStage2", 1], ["sulAmericanaGroups", 6]]);
    expect(placesOf("co")).toEqual([["libertadoresGroups", 2], ["libertadoresStage2", 2], ["sulAmericanaStage1", 4]]);
    expect(placesOf("uy")).toEqual([["libertadoresGroups", 2], ["libertadoresStage2", 1], ["libertadoresStage1", 1], ["sulAmericanaStage1", 4]]);
  });
});
