import { describe, expect, it } from "vitest";
import { advanceDay } from "./advanceDay.js";
import type { GameState } from "./gameState.js";
import { loadNewGame } from "./loadNewGame.js";
import { unpackJson } from "./packedJson.js";
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

  it("write the game shard of a game with countries with each player's strength marks as one line", () => {
    const [id, marks] = Object.entries(world.history.strength)[0] ?? [];
    if (!id || !marks?.[0]) throw new Error("no strength marks");
    const game = unpackJson(saveShards(world)[GAME_SHARD] ?? "");
    expect(game).toMatchObject({ history: { strength: { [id]: [marks[0].season, ...marks.map((mark) => mark.strength)] } } });
    expect(loadShards(saveShards(world)).history.strength).toStrictEqual(world.history.strength);
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

  it("pack the game and country shards of a game with result-only countries", () => {
    const { world: countries = {}, ...game } = playUntil(world, "2026-03-03");
    const shards = saveShards({ ...game, world: countries });
    expect(shards[GAME_SHARD]?.length).toBeLessThan(0.8 * saveGame(game).length);
    expect(shards["country-aa"]?.length).toBeLessThan(JSON.stringify(countries.aa).length);
  });

  it("load a save with result-only countries written before packing", () => {
    const played = playUntil(world, "2026-03-03");
    const { world: countries = {}, ...game } = played;
    const plain = { [GAME_SHARD]: saveGame(game), [WORLD_SHARD]: JSON.stringify(Object.keys(countries)), ...Object.fromEntries(Object.entries(countries).map(([id, country]) => [`country-${id}`, JSON.stringify(country)])) };
    expect(loadShards(plain)).toStrictEqual(played);
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
