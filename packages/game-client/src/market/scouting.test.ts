import { expect, test } from "vitest";
import { NO_FILTERS } from "./marketFilters.js";
import { EMPTY_SCOUTING, forgetFilter, keepFilter, readScouting, watch } from "./scouting.js";

const strikers = { ...NO_FILTERS, group: "ATT" as const, minStrength: 70 };

test("a player is watched once however often he is starred, and unstarring takes him off", () => {
  const watched = watch(watch(EMPTY_SCOUTING, "p1", true), "p1", true);
  expect(watched.watchList).toEqual(["p1"]);
  expect(watch(watched, "p1", false).watchList).toEqual([]);
});

test("a filter saved under a name it already has replaces the old one, and can be forgotten", () => {
  const kept = keepFilter(keepFilter(EMPTY_SCOUTING, "Atacantes", NO_FILTERS), " Atacantes ", strikers);
  expect(kept.savedFilters).toEqual([{ name: "Atacantes", filters: strikers }]);
  expect(forgetFilter(kept, "Atacantes").savedFilters).toEqual([]);
});

test("a filter needs a name", () => {
  expect(() => keepFilter(EMPTY_SCOUTING, "  ", strikers)).toThrow();
});

test("a filter saved before the market had a criterion reads back with that criterion off", () => {
  const old = { watchList: ["p1"], savedFilters: [{ name: "Velho", filters: { name: "", group: "GK" } }] };
  expect(readScouting(old)).toEqual({ watchList: ["p1"], savedFilters: [{ name: "Velho", filters: { ...NO_FILTERS, group: "GK" } }] });
});

test("a malformed watch list or filter does not read back", () => {
  expect(readScouting({ watchList: [1], savedFilters: [] })).toBeNull();
  expect(readScouting({ watchList: [], savedFilters: [{ filters: {} }] })).toBeNull();
  expect(readScouting(null)).toBeNull();
});
