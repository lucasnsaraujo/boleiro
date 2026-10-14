import { describe, expect, it } from "vitest";
import { advanceDay } from "./advanceDay.js";
import type { GameState } from "./gameState.js";
import { loadNewGame } from "./loadNewGame.js";
import { saveGame } from "./saveGame.js";
import { GAME_SHARD, loadShards, saveShards, WORLD_SHARD } from "./saveShards.js";
import type { CountryStructure, WorldClub } from "./world/world.js";

const structure = (id: string, window: [string, string]): CountryStructure => ({
  id,
  levels: [{ name: "Liga", legs: 2, promoted: 0, relegated: 0 }],
  window,
  continental: [],
});
const club = (id: string): WorldClub => ({ id, name: id, positions: "GDDDDMMMMAA", strengths: Array.from({ length: 11 }, () => 60) });
const clubs = (country: string) => [Array.from({ length: 6 }, (_, i) => club(`${country}-${i}`))];

function playUntil(state: GameState, date: string): GameState {
  let current = state;
  while (current.date < date) current = advanceDay(current, {}).state;
  return current;
}

describe("save shards", () => {
  const brazil = loadNewGame(3, { coachClubId: null });
  const world = loadNewGame(3, {
    coachClubId: null,
    world: [
      { structure: structure("aa", ["03-02", "06-30"]), levels: clubs("aa") },
      { structure: structure("bb", ["08-01", "11-30"]), levels: clubs("bb") },
    ],
  });

  it("keep a Brazil-only game in one shard written exactly as saveGame writes it", () => {
    expect(saveShards(brazil)).toEqual({ [GAME_SHARD]: saveGame(brazil) });
  });

  it("give each result-only country a shard of its own, and load back the same game", () => {
    const shards = saveShards(world);
    expect(Object.keys(shards).sort()).toEqual(["country-aa", "country-bb", GAME_SHARD, WORLD_SHARD].sort());
    expect(shards[GAME_SHARD]).not.toContain("aa-0");
    expect(loadShards(shards)).toStrictEqual(world);
  });

  it("load a save written whole, as before shards", () => {
    expect(loadShards({ [GAME_SHARD]: saveGame(world) })).toStrictEqual(world);
  });

  it("write only the shards that changed since the last save", () => {
    const firstMatchDay = playUntil(world, "2026-03-03");
    expect(Object.keys(saveShards(firstMatchDay, world)).sort()).toEqual(["country-aa", GAME_SHARD, WORLD_SHARD].sort());
    const quietDay = advanceDay(firstMatchDay, {}).state;
    expect(Object.keys(saveShards(quietDay, firstMatchDay)).sort()).toEqual([GAME_SHARD, WORLD_SHARD].sort());
  });

  it("refuse a save missing the shard of a country it lists", () => {
    const shards = Object.fromEntries(Object.entries(saveShards(world)).filter(([shard]) => shard !== "country-bb"));
    expect(() => loadShards(shards)).toThrow(/bb/);
  });
});
