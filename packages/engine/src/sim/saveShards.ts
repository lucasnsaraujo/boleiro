import type { GameState } from "./gameState.js";
import { saveGame, toGameState } from "./saveGame.js";
import type { Country, World } from "./world/world.js";

/** The game without its result-only countries: the whole save of a Brazil-only game. */
export const GAME_SHARD = "game";
const COUNTRY_SHARD = "country-";

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

function toCountry(parsed: unknown, shard: string): Country {
  if (!isCountry(parsed)) throw new Error(`save shard ${shard} is not a Boleiro country`);
  return parsed;
}

/**
 * The save split into shards written apart: the game, then one per result-only country. Given the
 * game as last saved, only the shards that changed since are returned; a country that played no match
 * is the same object and is left out.
 */
export function saveShards(state: GameState, saved?: GameState): Record<string, string> {
  const { world, ...game } = state;
  const shards: Record<string, string> = { [GAME_SHARD]: saveGame(game) };
  for (const [id, country] of Object.entries(world ?? {})) {
    if (country !== saved?.world?.[id]) shards[`${COUNTRY_SHARD}${id}`] = JSON.stringify(country);
  }
  return shards;
}

/** The game from all its shards; a save written whole, before shards, is its game shard alone. */
export function loadShards(shards: Readonly<Record<string, string>>): GameState {
  const whole = shards[GAME_SHARD];
  if (whole === undefined) throw new Error("the save has no game shard");
  const game = toGameState(JSON.parse(whole));
  const countries: World = {};
  for (const [shard, json] of Object.entries(shards)) {
    if (shard.startsWith(COUNTRY_SHARD)) countries[shard.slice(COUNTRY_SHARD.length)] = toCountry(JSON.parse(json), shard);
  }
  return Object.keys(countries).length ? { ...game, world: { ...game.world, ...countries } } : game;
}
