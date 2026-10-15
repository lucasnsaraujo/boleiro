import { GROUPS, type PositionGroup } from "./players.js";

export type WorldPackLeague = { id: string; name: string; tier: number };

export type WorldPackClub = { id: string; name: string; shortName: string; league: string | null; colours: { primary: string; secondary: string } };

/** A squad player as Transfermarkt lists him; the market value is null when it gives none. */
export type WorldPackPlayer = { clubId: string; name: string; group: PositionGroup; age: number | null; marketValueEur: number | null };

/** One country of the world scrape, decoded from the pack `pipeline/build_world_packs.py` writes. */
export type WorldPack = {
  packVersion: string;
  country: { id: string; name: string };
  /** The national leagues, top level first. */
  leagues: WorldPackLeague[];
  clubs: WorldPackClub[];
  players: WorldPackPlayer[];
};

const PACK_FORMAT = 1;

type Table = Record<string, unknown>;

function fail(path: string, expected: string): never {
  throw new Error(`world pack ${path}: expected ${expected}`);
}

function isTable(value: unknown): value is Table {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function tableOf(owner: Table, key: string): Table {
  const value = owner[key];
  if (!isTable(value)) fail(key, "a table");
  return value;
}

const isString = (value: unknown): value is string => typeof value === "string";
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isNumberOrNull = (value: unknown): value is number | null => value === null || isNumber(value);
const isStringOrNull = (value: unknown): value is string | null => value === null || isString(value);
const isGroup = (value: unknown): value is PositionGroup => GROUPS.some((group) => group === value);

function columnOf<T>(table: Table, path: string, key: string, rows: number | null, isValue: (value: unknown) => value is T): T[] {
  const values = table[key];
  if (!Array.isArray(values) || (rows !== null && values.length !== rows)) fail(`${path}.${key}`, `a column of ${rows ?? "any"} rows`);
  if (!values.every(isValue)) fail(`${path}.${key}`, "values of the right type");
  return values;
}

/** Decodes a country's world pack; throws on another format, a malformed column or a player of no club. */
export function parseWorldPack(json: string): WorldPack {
  const pack: unknown = JSON.parse(json);
  if (!isTable(pack) || pack.format !== PACK_FORMAT) fail("format", String(PACK_FORMAT));
  if (!isString(pack.packVersion)) fail("packVersion", "a version");
  const country = tableOf(pack, "country");
  if (!isString(country.id) || !isString(country.name)) fail("country", "an id and a name");

  const competitions = tableOf(pack, "competitions");
  const competitionIds = columnOf(competitions, "competitions", "id", null, isString);
  const competitionRows = competitionIds.length;
  const kinds = columnOf(competitions, "competitions", "kind", competitionRows, isString);
  const names = columnOf(competitions, "competitions", "name", competitionRows, isString);
  const tiers = columnOf(competitions, "competitions", "tier", competitionRows, isNumberOrNull);
  const leagues = competitionIds
    .flatMap((id, row) => (kinds[row] === "league" ? [{ id, name: names[row] ?? "", tier: tiers[row] ?? 0 }] : []))
    .sort((a, b) => a.tier - b.tier);

  const clubTable = tableOf(pack, "clubs");
  const clubIds = columnOf(clubTable, "clubs", "id", null, isString);
  const clubRows = clubIds.length;
  const clubNames = columnOf(clubTable, "clubs", "name", clubRows, isString);
  const shortNames = columnOf(clubTable, "clubs", "shortName", clubRows, isString);
  const clubLeagues = columnOf(clubTable, "clubs", "league", clubRows, isStringOrNull);
  const primary = columnOf(clubTable, "clubs", "primaryColour", clubRows, isString);
  const secondary = columnOf(clubTable, "clubs", "secondaryColour", clubRows, isString);
  const clubs = clubIds.map((id, row) => ({
    id,
    name: clubNames[row] ?? id,
    shortName: shortNames[row] ?? id,
    league: clubLeagues[row] ?? null,
    colours: { primary: primary[row] ?? "", secondary: secondary[row] ?? "" },
  }));

  const playerTable = tableOf(pack, "players");
  const playerClubs = columnOf(playerTable, "players", "club", null, isNumber);
  const playerRows = playerClubs.length;
  const playerNames = columnOf(playerTable, "players", "name", playerRows, isString);
  const groups = columnOf(playerTable, "players", "group", playerRows, isGroup);
  const ages = columnOf(playerTable, "players", "age", playerRows, isNumberOrNull);
  const values = columnOf(playerTable, "players", "marketValueEur", playerRows, isNumberOrNull);
  const players = playerClubs.map((clubRow, row): WorldPackPlayer => {
    const clubId = clubIds[clubRow];
    if (clubId === undefined) fail(`players.club[${row}]`, `a club row below ${clubRows}`);
    return { clubId, name: playerNames[row] ?? "", group: groups[row] ?? "MID", age: ages[row] ?? null, marketValueEur: values[row] || null };
  });

  return { packVersion: pack.packVersion, country: { id: country.id, name: country.name }, leagues, clubs, players };
}

/**
 * Reads a country's shipped world pack in Node. The Node modules are fetched on call, not imported,
 * so the browser can bundle `parseWorldPack` next to this without pulling in `node:fs`.
 */
export function loadWorldPack(countryId: string): WorldPack {
  const { readFileSync } = process.getBuiltinModule("node:fs");
  const { dirname, join } = process.getBuiltinModule("node:path");
  const { fileURLToPath } = process.getBuiltinModule("node:url");
  const { gunzipSync } = process.getBuiltinModule("node:zlib");
  const file = join(dirname(fileURLToPath(import.meta.url)), "..", "pack", "world", `${countryId}.pack.json.gz`);
  return parseWorldPack(gunzipSync(readFileSync(file)).toString("utf8"));
}
