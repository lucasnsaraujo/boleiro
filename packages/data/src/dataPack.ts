import { PITCHES, STATES, type Club } from "./clubs.js";
import { toCompetitionMoney, type CompetitionMoney } from "./competition-money.js";
import { BASES, FIELDS as FINANCE_FIELDS, SIZES, type ClubFinances, type DivisionFinances, type Finances } from "./finances.js";
import { DIVISIONS, GROUPS, type SquadPlayer } from "./players.js";

/** Everything the game is built from, decoded from the data pack `pipeline/build_pack.py` writes. */
export type DataPack = {
  /** Names the pack's content; a save keeps the version its career started with. */
  packVersion: string;
  clubs: Club[];
  players: SquadPlayer[];
  finances: { clubs: ClubFinances[]; divisionEstimates: DivisionFinances[] };
  competitionMoney: CompetitionMoney;
};

const PACK_FORMAT = 1;
export const PACK_FILE = "brazil.pack.json.gz";
/**
 * The pack built from the 2026 Brazil CSVs: the data every save made before packs existed started
 * from. It stays this value when a newer pack ships; the shipped one is `loadPack().packVersion`.
 */
export const FIRST_PACK_VERSION = "br-a49b7692d13f";

/** One table of the pack: a column per field, every column `rows` long. */
type Table = { name: string; record: Record<string, unknown>; rows: number };
/** A column checked for its type, read by row index. */
type Column<T> = (row: number) => T;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(path: string, expected: string): never {
  throw new Error(`data pack ${path}: expected ${expected}`);
}

function tableOf(value: unknown, name: string, rows: number | string): Table {
  if (!isRecord(value)) fail(name, "a table");
  if (typeof rows === "number") return { name, record: value, rows };
  const key = value[rows];
  if (!Array.isArray(key)) fail(`${name}.${rows}`, "a column");
  return { name, record: value, rows: key.length };
}

function column<T>(table: Table, key: string, isValue: (value: unknown) => value is T, expected: string): Column<T> {
  const path = `${table.name}.${key}`;
  const values = table.record[key];
  if (!Array.isArray(values) || values.length !== table.rows) fail(path, `a column of ${table.rows} rows`);
  if (!values.every(isValue)) fail(path, expected);
  return (row) => {
    const value = values[row];
    if (value === undefined) fail(path, `row ${row}`);
    return value;
  };
}

const isString = (value: unknown): value is string => typeof value === "string";
const isNumber = (value: unknown): value is number => typeof value === "number";
const isNumberOrNull = (value: unknown): value is number | null => value === null || isNumber(value);

const text = (table: Table, key: string) => column(table, key, isString, "strings");
const amount = (table: Table, key: string) => column(table, key, isNumber, "numbers");

function oneOf<T extends string>(table: Table, key: string, options: readonly T[]): Column<T> {
  return column(table, key, (value): value is T => options.some((option) => option === value), options.join(" | "));
}

function oneOfOrNull<T extends string>(table: Table, key: string, options: readonly T[]): Column<T | null> {
  return column(table, key, (value): value is T | null => value === null || options.some((option) => option === value), `${options.join(" | ")} | null`);
}

function rowsOf<T>(table: Table, read: (row: number) => T): T[] {
  return Array.from({ length: table.rows }, (_, row) => read(row));
}

function clubsOf(table: Table): Club[] {
  const sources = tableOf(table.record.sources, `${table.name}.sources`, table.rows);
  const id = text(table, "id");
  const transfermarktId = text(table, "transfermarktId");
  const name = text(table, "name");
  const shortName = text(table, "shortName");
  const state = oneOf(table, "state", STATES);
  const division = oneOfOrNull(table, "division", DIVISIONS);
  const stadium = text(table, "stadium");
  const capacity = amount(table, "capacity");
  const pitch = oneOf(table, "pitch", PITCHES);
  const primary = text(table, "primaryColour");
  const secondary = text(table, "secondaryColour");
  const fanbase = amount(table, "fanbase");
  const source = {
    names: text(sources, "names"),
    state: text(sources, "state"),
    division: text(sources, "division"),
    stadium: text(sources, "stadium"),
    pitch: text(sources, "pitch"),
    colours: text(sources, "colours"),
    fanbase: text(sources, "fanbase"),
  };
  return rowsOf(table, (row) => ({
    id: id(row),
    transfermarktId: transfermarktId(row),
    name: name(row),
    shortName: shortName(row),
    state: state(row),
    division: division(row),
    stadium: stadium(row),
    capacity: capacity(row),
    pitch: pitch(row),
    colours: { primary: primary(row), secondary: secondary(row) },
    fanbase: fanbase(row),
    sources: {
      names: source.names(row),
      state: source.state(row),
      division: source.division(row),
      stadium: source.stadium(row),
      pitch: source.pitch(row),
      colours: source.colours(row),
      fanbase: source.fanbase(row),
    },
  }));
}

function clubAt(clubs: readonly Club[], table: Table): Column<Club> {
  const index = amount(table, "club");
  return (row) => clubs[index(row)] ?? fail(`${table.name}.club`, `a club index below ${clubs.length}`);
}

function playersOf(table: Table, clubs: readonly Club[]): SquadPlayer[] {
  const club = clubAt(clubs, table);
  const name = text(table, "name");
  const group = oneOf(table, "group", GROUPS);
  const strength = amount(table, "strength");
  const age = column(table, "age", isNumberOrNull, "numbers or nulls");
  const nationalities = text(table, "nationalities");
  return rowsOf(table, (row) => {
    const { id, name: clubName, division } = club(row);
    return {
      clubId: id,
      club: clubName,
      division,
      name: name(row),
      group: group(row),
      strength: strength(row),
      age: age(row),
      nationalities: nationalities(row).split("/").filter(Boolean),
    };
  });
}

function financesOf(table: Table): Column<Finances> {
  const season = amount(table, "season");
  const total = amount(table, "revenueTotal");
  const broadcasting = amount(table, "broadcasting");
  const matchday = amount(table, "matchday");
  const membership = amount(table, "membership");
  const sponsorship = amount(table, "sponsorship");
  const playerSales = amount(table, "playerSales");
  const wageBill = amount(table, "wageBill");
  const netDebt = amount(table, "netDebt");
  const basis = oneOf(table, "basis", BASES);
  const guessedFields = text(table, "guessedFields");
  const source = text(table, "source");
  const isFinanceField = (field: string): field is (typeof FINANCE_FIELDS)[number] => FINANCE_FIELDS.some((option) => option === field);
  return (row) => ({
    season: season(row),
    revenue: {
      total: total(row),
      broadcasting: broadcasting(row),
      matchday: matchday(row),
      membership: membership(row),
      sponsorship: sponsorship(row),
      playerSales: playerSales(row),
    },
    wageBill: wageBill(row),
    netDebt: netDebt(row),
    basis: basis(row),
    guessedFields: guessedFields(row)
      .split(";")
      .filter((field) => field !== "")
      .map((field) => (isFinanceField(field) ? field : fail(`${table.name}.guessedFields`, FINANCE_FIELDS.join(" | ")))),
    source: source(row),
  });
}

function clubFinancesOf(table: Table, clubs: readonly Club[]): ClubFinances[] {
  const finances = financesOf(table);
  const club = clubAt(clubs, table);
  const division = oneOf(table, "division", DIVISIONS);
  return rowsOf(table, (row) => ({ ...finances(row), clubId: club(row).id, division: division(row) }));
}

function divisionEstimatesOf(table: Table): DivisionFinances[] {
  const finances = financesOf(table);
  const division = oneOf(table, "division", DIVISIONS);
  const size = oneOf(table, "size", SIZES);
  return rowsOf(table, (row) => ({ ...finances(row), division: division(row), size: size(row) }));
}

function packOf(json: string): Record<string, unknown> {
  const pack: unknown = JSON.parse(json);
  if (!isRecord(pack)) fail("", "an object");
  if (pack.format !== PACK_FORMAT) fail("format", String(PACK_FORMAT));
  return pack;
}

/** Decodes the pack's JSON text into the game's inputs; throws on a pack of another format or a malformed column. */
export function parsePack(json: string): DataPack {
  const pack = packOf(json);
  if (typeof pack.packVersion !== "string" || pack.packVersion === "") fail("packVersion", "a version");
  if (!isRecord(pack.finances)) fail("finances", "an object");
  const clubs = clubsOf(tableOf(pack.clubs, "clubs", "id"));
  return {
    packVersion: pack.packVersion,
    clubs,
    players: playersOf(tableOf(pack.players, "players", "name"), clubs),
    finances: {
      clubs: clubFinancesOf(tableOf(pack.finances.clubs, "finances.clubs", "season"), clubs),
      divisionEstimates: divisionEstimatesOf(tableOf(pack.finances.divisionEstimates, "finances.divisionEstimates", "season")),
    },
    competitionMoney: toCompetitionMoney(pack.competitionMoney),
  };
}

/** The clubs alone, from a pack whose other tables may have been left out (`?gunzip&keys=format,clubs`). */
export function parsePackClubs(json: string): Club[] {
  return clubsOf(tableOf(packOf(json).clubs, "clubs", "id"));
}

/**
 * Reads the shipped pack in Node. The Node modules are fetched on call, not imported, so the
 * browser can bundle `parsePack` next to this without pulling in `node:fs`.
 */
export function loadPack(): DataPack {
  const { readFileSync } = process.getBuiltinModule("node:fs");
  const { dirname, join } = process.getBuiltinModule("node:path");
  const { fileURLToPath } = process.getBuiltinModule("node:url");
  const { gunzipSync } = process.getBuiltinModule("node:zlib");
  const packFile = join(dirname(fileURLToPath(import.meta.url)), "..", "pack", PACK_FILE);
  return parsePack(gunzipSync(readFileSync(packFile)).toString("utf8"));
}
