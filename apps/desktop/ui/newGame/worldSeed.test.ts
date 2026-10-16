import { expect, test } from "vitest";
import { E2E_SEED_KEY, worldSeed } from "./worldSeed.js";

const storeWith = (value: string | null) => ({ getItem: (key: string) => (key === E2E_SEED_KEY ? value : null) });
const drawSeeds = (value: string | null, isE2eBuild: boolean) => new Set(Array.from({ length: 5 }, () => worldSeed(storeWith(value), isE2eBuild)));

test("an e2e build starts a new game from the seed its test set", () => {
  expect(worldSeed(storeWith("7"), true)).toBe(7);
});

test("a production build draws a random seed even when the key is set", () => {
  expect(drawSeeds("7", false).size).toBeGreaterThan(1);
});

test("an e2e build with no usable seed in the key draws a random one", () => {
  for (const value of [null, "", "abc", "1.5", "0"]) expect(drawSeeds(value, true).size).toBeGreaterThan(1);
});
