import type { GameState } from "./gameState.js";
import { packJson, unpackJson } from "./packedJson.js";
import { saveGame, toGameState, withStrengthLines } from "./saveGame.js";
import type { Country, World } from "./world/world.js";

/** The game without its result-only countries: the whole save of a Brazil-only game. */
export const GAME_SHARD = "game";
/** The ids of the game's result-only countries, so a load can tell a country's shard went missing. */
export const WORLD_SHARD = "world";
/** Prefix of each result-only country's shard, followed by the country's id. */
export const COUNTRY_SHARD = "country-";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCountry(value: unknown): value is Country {
  return (
    isRecord(value) &&
    isRecord(value.structure) &&
    isRecord(value.clubs) &&
    Array.isArray(value.leagues) &&
    Array.isArray(value.seasons) &&
    typeof value.rngState === "number"
  );
}

function countryIdsOf(json: string): string[] {
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed) || !parsed.every((id) => typeof id === "string")) throw new Error("the save's world shard is not a list of countries");
  return parsed;
}

function countryOf(shards: Readonly<Record<string, string>>, id: string): Country {
  const json = shards[`${COUNTRY_SHARD}${id}`];
  if (json === undefined) throw new Error(`the save is missing the shard of country ${id}`);
  const parsed = unpackJson(json);
  if (!isCountry(parsed)) throw new Error(`the save's shard of country ${id} is not a Boleiro country`);
  return parsed;
}

/**
 * The save split into shards written apart: the game, then with result-only countries their list
 * and one shard each. Given the game as last saved, a country that played no match since is the same
 * object and its shard is left out. A Brazil-only game is one shard written as saveGame writes it; a
 * game with result-only countries writes its game and countries as packed JSON (packJson), about a
 * third smaller.
 */
export function saveShards(state: GameState, saved?: GameState): Record<string, string> {
  const { world, ...game } = state;
  if (!world) return { [GAME_SHARD]: saveGame(game) };
  const shards: Record<string, string> = { [GAME_SHARD]: packJson(withStrengthLines(game)) };
  shards[WORLD_SHARD] = JSON.stringify(Object.keys(world));
  for (const [id, country] of Object.entries(world)) {
    if (country !== saved?.world?.[id]) shards[`${COUNTRY_SHARD}${id}`] = packJson(country);
  }
  return shards;
}

/** The game from all its shards, packed or not; a save written whole, before shards, is its game shard alone. */
export function loadShards(shards: Readonly<Record<string, string>>): GameState {
  const whole = shards[GAME_SHARD];
  if (whole === undefined) throw new Error("the save has no game shard");
  const game = toGameState(unpackJson(whole));
  const countryIds = shards[WORLD_SHARD];
  if (countryIds === undefined) return game;
  const world: World = Object.fromEntries(countryIdsOf(countryIds).map((id) => [id, countryOf(shards, id)]));
  return { ...game, world };
}
