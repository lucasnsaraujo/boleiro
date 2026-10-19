import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { imageFileOf, parseAssetManifest } from "./assetManifest.js";

// The world packs `pipeline/build_world_packs.py` writes from the latest Transfermarkt scrape, checked
// for the data a career in any of their leagues needs. The game doesn't load them yet.
const PACK = join(import.meta.dirname, "..", "pack");
const WORLD = join(PACK, "world");
const NATIONAL_TEAMS = "national-teams.pack.json.gz";
const brazilAssets = parseAssetManifest(readFileSync(join(PACK, "assets.json"), "utf8"));
// The world scrape's crests for clubs Brazil's CSVs don't have, WebP only (pipeline/build_assets.py).
const worldAssets = parseAssetManifest(readFileSync(join(WORLD, "assets.json"), "utf8"));
// Bytes: today 10,550 and 7,357,534 (1,029 crests, 64 and 128 px boxes, WebP). assetBudget.test.ts holds
// them together with Brazil's images to SPEC §4.3's ~25 MB for the v1 world.
const WORLD_CREST_BUDGET = { largestFile: 13_000, total: 7_600_000 };
const MIN_SQUAD = 11;
const COLOUR = /^#[0-9A-F]{6}$/i;
// Transfermarkt listed fewer than eleven players or no goalkeeper for these on 2026-10-14: Série D clubs
// out of this season and two Venezuelan clubs. A new game tops short squads up with academy players.
const SHORT_ON_TRANSFERMARKT = new Set([
  "abecat-ouvidorense-go",
  "crac-go",
  "guarany-de-bage-rs",
  "portuguesa-sp",
  "sao-luiz-rs",
  "tm-28292",
  "tm-67224",
]);

type Table = Record<string, unknown>;

function isRecord(value: unknown): value is Table {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function tableOf(owner: Table, key: string): Table {
  const value = owner[key];
  if (!isRecord(value)) throw new Error(`world pack: ${key} is not a table`);
  return value;
}

function columnOf<T>(table: Table, key: string, isValue: (value: unknown) => value is T): T[] {
  const values = table[key];
  if (!Array.isArray(values) || !values.every(isValue)) throw new Error(`world pack: column ${key} has the wrong type`);
  return values;
}

const isString = (value: unknown): value is string => typeof value === "string";
const isNumber = (value: unknown): value is number => typeof value === "number";
const isStringOrNull = (value: unknown): value is string | null => value === null || isString(value);
const isNumberOrNull = (value: unknown): value is number | null => value === null || isNumber(value);

function packOf(file: string): Table {
  const pack: unknown = JSON.parse(gunzipSync(readFileSync(join(WORLD, file))).toString("utf8"));
  if (!isRecord(pack)) throw new Error(`${file} is not a JSON object`);
  return pack;
}

type WorldClub = { pack: string; id: string; name: string; league: string | null; colours: string[]; sources: (string | null)[]; roles: (string | null)[] };

function clubsOf(file: string): WorldClub[] {
  const pack = packOf(file);
  const clubs = tableOf(pack, "clubs");
  const players = tableOf(pack, "players");
  const sources = tableOf(clubs, "sources");
  const primary = columnOf(clubs, "primaryColour", isString);
  const secondary = columnOf(clubs, "secondaryColour", isString);
  const leagues = columnOf(clubs, "league", isStringOrNull);
  const names = columnOf(clubs, "name", isString);
  const playerClubs = columnOf(players, "club", isNumber);
  const roles = columnOf(players, "role", isStringOrNull);
  const sourceColumns = Object.keys(sources).map((field) => columnOf(sources, field, isStringOrNull));
  return columnOf(clubs, "id", isString).map((id, row) => ({
    pack: file,
    id,
    name: names[row] ?? "",
    league: leagues[row] ?? null,
    colours: [primary[row] ?? "", secondary[row] ?? ""],
    sources: sourceColumns.map((column) => column[row] ?? null),
    roles: roles.filter((_, player) => playerClubs[player] === row),
  }));
}

type League = { pack: string; id: string; tier: number | null; clubs: number };

function leaguesOf(file: string, clubs: readonly WorldClub[]): League[] {
  const competitions = tableOf(packOf(file), "competitions");
  const kinds = columnOf(competitions, "kind", isString);
  const tiers = columnOf(competitions, "tier", isNumberOrNull);
  return columnOf(competitions, "id", isString).flatMap((id, row) =>
    kinds[row] === "league" ? [{ pack: file, id, tier: tiers[row] ?? null, clubs: clubs.filter((club) => club.league === id).length }] : [],
  );
}

type ExpectedLeague = { id: string; clubs: number };

// The world's countries and the club count of each league, as pipeline/tm_world.py's COUNTRIES records them.
function expectedWorldOf(source: string): { countries: string[]; leagues: ExpectedLeague[]; leagueCalls: number } {
  const start = source.indexOf("COUNTRIES = (");
  const block = source.slice(start, source.indexOf("\n)\n", start));
  const countries = [...block.matchAll(/Country\("([a-z-]+)"([\s\S]*?)(?=Country\(|$)/g)];
  return {
    countries: countries.map((match) => match[1] ?? ""),
    leagues: countries.flatMap((match) =>
      [...(match[2] ?? "").matchAll(/League\((\d+), "[^"]+", (\d+)/g)].map((league) => ({
        id: `${match[1] ?? ""}-${league[1] ?? ""}`,
        clubs: Number(league[2]),
      })),
    ),
    leagueCalls: (block.match(/League\(/g) ?? []).length,
  };
}

const countryFiles = readdirSync(WORLD).filter((file) => file.endsWith(".pack.json.gz") && file !== NATIONAL_TEAMS).sort();
const clubs = countryFiles.flatMap(clubsOf);
const leagues = countryFiles.flatMap((file) => leaguesOf(file, clubs.filter((club) => club.pack === file)));
const expectedWorld = expectedWorldOf(readFileSync(join(import.meta.dirname, "..", "..", "..", "pipeline", "tm_world.py"), "utf8"));

describe("the world packs", () => {
  it("cover the v1 world's clubs", () => {
    expect(clubs.length).toBeGreaterThan(1_000);
  });

  it("have a pack for every country pipeline/tm_world.py lists", () => {
    expect(expectedWorld.countries.length).toBeGreaterThan(0);
    expect(expectedWorld.countries.filter((country) => !countryFiles.includes(`${country}.pack.json.gz`))).toEqual([]);
  });

  it("give each league exactly the clubs pipeline/tm_world.py records for it", () => {
    expect(expectedWorld.leagues.length).toBe(expectedWorld.leagueCalls);
    const found = new Map(leagues.map((league) => [league.id, league.clubs]));
    const wrong = expectedWorld.leagues.filter((league) => found.get(league.id) !== league.clubs);
    expect(wrong.map((league) => `${league.id}: ${String(found.get(league.id) ?? "no league")}, expected ${String(league.clubs)}`)).toEqual([]);
  });

  it("give every club at least eleven players and a goalkeeper", () => {
    const short = clubs.filter((club) => !SHORT_ON_TRANSFERMARKT.has(club.id) && (club.roles.length < MIN_SQUAD || !club.roles.includes("goleiro")));
    expect(short.map((club) => `${club.name} (${club.id}): ${club.roles.length} players`)).toEqual([]);
  });

  it("give every club a crest in the asset manifest", () => {
    const missing = clubs.filter((club) => (brazilAssets.clubs[club.id] ?? worldAssets.clubs[club.id])?.crest === undefined);
    expect(missing.map((club) => `${club.name} (${club.id})`)).toEqual([]);
  });

  it("keep the world's crests within budget", () => {
    const files = Object.entries(worldAssets.images).flatMap(([id, image]) =>
      image.boxes.flatMap((box) => image.formats.map((format) => join(WORLD, "assets", `${id}-${box}.${format}`))),
    );
    expect(files.filter((file) => !existsSync(file))).toEqual([]);
    const sizes = files.map((file) => statSync(file).size);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(WORLD_CREST_BUDGET.largestFile);
    expect(sizes.reduce((sum, size) => sum + size, 0)).toBeLessThanOrEqual(WORLD_CREST_BUDGET.total);
  });

  it("serve a world crest's 128 px file where a 256 px one is asked for", () => {
    const [clubId] = Object.keys(worldAssets.clubs);
    expect(imageFileOf(worldAssets, clubId ?? "", "crest", 256, "webp")).toMatch(/-128\.webp$/);
  });

  it("give every club two colours and a source for every field", () => {
    const incomplete = clubs.filter((club) => !club.colours.every((colour) => COLOUR.test(colour)) || club.sources.includes(null));
    expect(incomplete.map((club) => `${club.name} (${club.id})`)).toEqual([]);
  });

  it("fill every country's league tiers from the first down, each with enough clubs for a season", () => {
    const tiersOf = (pack: string) => leagues.filter((league) => league.pack === pack).map((league) => league.tier);
    const gaps = countryFiles.filter((pack) => tiersOf(pack).join() !== tiersOf(pack).map((_, i) => i + 1).join());
    expect(gaps).toEqual([]);
    expect(leagues.filter((league) => league.clubs < 10).map((league) => `${league.id}: ${league.clubs}`)).toEqual([]);
  });

  it("give every national team a squad of at least eleven with a goalkeeper", () => {
    const pack = packOf(NATIONAL_TEAMS);
    const names = columnOf(tableOf(pack, "teams"), "name", isString);
    const players = tableOf(pack, "players");
    const teams = columnOf(players, "team", isNumber);
    const roles = columnOf(players, "role", isStringOrNull);
    const short = names.filter((_, team) => {
      const squad = roles.filter((_, player) => teams[player] === team);
      return squad.length < MIN_SQUAD || !squad.includes("goleiro");
    });
    expect(names.length).toBeGreaterThan(50);
    expect(short).toEqual([]);
  });
});
