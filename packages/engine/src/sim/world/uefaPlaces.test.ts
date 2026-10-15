import { describe, expect, it } from "vitest";
import { uefaPlaces } from "./uefaPlaces.js";

const table = ["a", "b", "c", "d", "e", "f"];

describe("a country's places in UEFA's cups", () => {
  it("gives the Champions League places down the table and the Europa League's to the cup winner first", () => {
    expect(uefaPlaces({ championsLeague: 2, europaLeague: 2 }, table, { championId: "f", runnerUpId: "a" })).toEqual({
      "champions-league": ["a", "b"],
      "europa-league": ["f", "c"],
    });
  });

  it("hands the cup winner's Europa League place down the table when he is in the Champions League already", () => {
    expect(uefaPlaces({ championsLeague: 2, europaLeague: 2 }, table, { championId: "b", runnerUpId: "e" })).toEqual({
      "champions-league": ["a", "b"],
      "europa-league": ["c", "d"],
    });
  });

  it("keeps the cup winner out when the country has no Europa League place", () => {
    expect(uefaPlaces({ championsLeague: 1, europaLeague: 0 }, table, { championId: "f", runnerUpId: "a" })).toEqual({
      "champions-league": ["a"],
      "europa-league": [],
    });
  });
});
