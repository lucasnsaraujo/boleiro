/** The places on a kit a brand can buy, the kit maker (`kit`) included, in the order a shirt lists them. */
export const SPONSOR_SLOTS = ["master", "kit", "front", "back", "sleeves", "shorts", "socks", "number"] as const;
export type SponsorSlot = (typeof SPONSOR_SLOTS)[number];

/** How big a brand is, for the clubs it can afford: a national giant down to a regional firm. */
export const BRAND_SIZES = ["giant", "large", "medium", "small"] as const;
export type BrandSize = (typeof BRAND_SIZES)[number];

/**
 * A brand on a shirt or in the offer pool. `sector` is "betting", "kit" (a kit maker) or the pool's
 * sector ("bank", "food", …), empty for a shirt brand outside the pool; `size` only for the pool's.
 */
export type Brand = { id: string; name: string; sector: string; size: BrandSize | null; isPool: boolean };

/**
 * A brand on a club's kit before the betting ban, from Wikipedia: its place on the kit and its order
 * there (`rank`, 0 first). `yearly` (BRL) and `untilSeason` only when the press reported them, with
 * `valueSource`; `source` is the Wikipedia revision the deal comes from.
 */
export type ShirtDeal = {
  clubId: string;
  slot: SponsorSlot;
  rank: number;
  brandId: string;
  yearly: number | null;
  untilSeason: number | null;
  valueSource: string;
  source: string;
};

/** `packages/data/pack/sponsors.pack.json.gz`, written by `pipeline/build_pack.py`. */
export type SponsorsPack = { packVersion: string; brands: Brand[]; deals: ShirtDeal[] };

export const SPONSORS_PACK_FILE = "sponsors.pack.json.gz";
const PACK_FORMAT = 1;

export const isBettingBrand = (brand: Pick<Brand, "sector">): boolean => brand.sector === "betting";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(path: string, expected: string): never {
  throw new Error(`sponsors pack ${path}: expected ${expected}`);
}

/** A table's column, checked row by row; every column of a table is as long as its first. */
function columnOf<T>(table: Record<string, unknown>, name: string, key: string, rows: number, isValue: (value: unknown) => value is T, expected: string): T[] {
  const values = table[key];
  if (!Array.isArray(values) || values.length !== rows) fail(`${name}.${key}`, `a column of ${rows} rows`);
  if (!values.every(isValue)) fail(`${name}.${key}`, expected);
  return values;
}

const isString = (value: unknown): value is string => typeof value === "string";
const isNumberOrNull = (value: unknown): value is number | null => value === null || typeof value === "number";
const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";
const isNumber = (value: unknown): value is number => typeof value === "number";
const isSlot = (value: unknown): value is SponsorSlot => SPONSOR_SLOTS.some((slot) => slot === value);
const isSizeOrNull = (value: unknown): value is BrandSize | null => value === null || BRAND_SIZES.some((size) => size === value);

function tableOf(value: unknown, name: string, key: string): { table: Record<string, unknown>; rows: number } {
  if (!isRecord(value)) fail(name, "a table");
  const first = value[key];
  if (!Array.isArray(first)) fail(`${name}.${key}`, "a column");
  return { table: value, rows: first.length };
}

/** Decodes the sponsors pack's JSON text; throws on another format or a malformed column. */
export function parseSponsorsPack(json: string): SponsorsPack {
  const pack: unknown = JSON.parse(json);
  if (!isRecord(pack) || pack.format !== PACK_FORMAT) fail("format", String(PACK_FORMAT));
  if (typeof pack.packVersion !== "string" || pack.packVersion === "") fail("packVersion", "a version");
  const brands = tableOf(pack.brands, "brands", "id");
  const column = <T>(of: typeof brands, name: string, key: string, isValue: (value: unknown) => value is T, expected: string) =>
    columnOf(of.table, name, key, of.rows, isValue, expected);
  const id = column(brands, "brands", "id", isString, "strings");
  const name = column(brands, "brands", "name", isString, "strings");
  const sector = column(brands, "brands", "sector", isString, "strings");
  const size = column(brands, "brands", "size", isSizeOrNull, "brand sizes or null");
  const isPool = column(brands, "brands", "isPool", isBoolean, "booleans");
  const deals = tableOf(pack.deals, "deals", "club");
  const club = column(deals, "deals", "club", isString, "strings");
  const slot = column(deals, "deals", "slot", isSlot, SPONSOR_SLOTS.join(" | "));
  const rank = column(deals, "deals", "rank", isNumber, "numbers");
  const brand = column(deals, "deals", "brand", (value): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0 && value < brands.rows, "brand rows");
  const yearly = column(deals, "deals", "yearly", isNumberOrNull, "numbers or null");
  const untilSeason = column(deals, "deals", "untilSeason", isNumberOrNull, "numbers or null");
  const valueSource = column(deals, "deals", "valueSource", isString, "strings");
  const source = column(deals, "deals", "source", isString, "strings");
  const at = <T>(values: readonly T[], row: number): T => {
    const value = values[row];
    if (value === undefined) fail("row", String(row));
    return value;
  };
  return {
    packVersion: pack.packVersion,
    brands: Array.from({ length: brands.rows }, (_, row) => ({ id: at(id, row), name: at(name, row), sector: at(sector, row), size: at(size, row), isPool: at(isPool, row) })),
    deals: Array.from({ length: deals.rows }, (_, row) => ({
      clubId: at(club, row),
      slot: at(slot, row),
      rank: at(rank, row),
      brandId: at(id, at(brand, row)),
      yearly: at(yearly, row),
      untilSeason: at(untilSeason, row),
      valueSource: at(valueSource, row),
      source: at(source, row),
    })),
  };
}

/** Reads the shipped sponsors pack in Node; the Node modules are fetched on call, so the browser can bundle the parser. */
export function loadSponsorsPack(): SponsorsPack {
  const { readFileSync } = process.getBuiltinModule("node:fs");
  const { dirname, join } = process.getBuiltinModule("node:path");
  const { fileURLToPath } = process.getBuiltinModule("node:url");
  const { gunzipSync } = process.getBuiltinModule("node:zlib");
  const file = join(dirname(fileURLToPath(import.meta.url)), "..", "pack", SPONSORS_PACK_FILE);
  return parseSponsorsPack(gunzipSync(readFileSync(file)).toString("utf8"));
}
