import { ROLES, type Role } from "./players.js";

export const CONFEDERATIONS = ["CONMEBOL", "UEFA", "CONCACAF", "CAF", "AFC", "OFC"] as const;
export type Confederation = (typeof CONFEDERATIONS)[number];

/** A national team: its confederation, FIFA code ("BRA") and home kit colours. */
export type NationalTeamData = { id: string; name: string; confederation: Confederation; code: string; colours: { primary: string; secondary: string } };

/** A player of a national team's last real squad, as Transfermarkt lists him; the club is Transfermarkt's. */
export type NationalSquadEntry = {
  teamId: string;
  id: string;
  name: string;
  role: Role;
  birthDate: string | null;
  clubTransfermarktId: string | null;
  clubName: string;
  marketValueEur: number | null;
  caps: number | null;
};

/** A team's place in the FIFA men's ranking; a team without a squad in the game keeps its own slug. */
export type RankingRow = { teamId: string; name: string; rank: number; points: number };

/** A real match of a national competition: a group match with its teams, or a knockout round's day with none drawn yet (`homeId` empty). */
export type RealFixture = { competition: string; round: string; group: string; date: string; homeId: string; awayId: string };

/** `national-teams.pack.json.gz` (the world scrape's squads) and `national-football.pack.json.gz` (pipeline/fetch_national_football.py) together. */
export type NationalFootball = {
  packVersion: string;
  teams: NationalTeamData[];
  squads: NationalSquadEntry[];
  ranking: { date: string; source: string; rows: RankingRow[] };
  fixtures: RealFixture[];
};

const PACK_FORMAT = 1;
const CONFEDERATION_NAMES: Record<string, Confederation> = { "South American Football Confederation": "CONMEBOL" };

type Table = Record<string, unknown>;

function fail(path: string, expected: string): never {
  throw new Error(`national pack ${path}: expected ${expected}`);
}

const isTable = (value: unknown): value is Table => typeof value === "object" && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string";
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isStringOrNull = (value: unknown): value is string | null => value === null || isString(value);
const isNumberOrNull = (value: unknown): value is number | null => value === null || isNumber(value);
const isRole = (value: unknown): value is Role => ROLES.some((role) => role === value);

function tableOf(owner: Table, key: string): Table {
  const value = owner[key];
  if (!isTable(value)) fail(key, "a table");
  return value;
}

function columnOf<T>(table: Table, path: string, key: string, rows: number | null, isValue: (value: unknown) => value is T): T[] {
  const values = table[key];
  if (!Array.isArray(values) || (rows !== null && values.length !== rows)) fail(`${path}.${key}`, `a column of ${rows ?? "any"} rows`);
  if (!values.every(isValue)) fail(`${path}.${key}`, "values of the right type");
  return values;
}

function packOf(json: string): Table & { packVersion: string } {
  const pack: unknown = JSON.parse(json);
  if (!isTable(pack) || pack.format !== PACK_FORMAT) fail("format", String(PACK_FORMAT));
  if (!isString(pack.packVersion)) fail("packVersion", "a version");
  return { ...pack, packVersion: pack.packVersion };
}

function confederationOf(name: string): Confederation {
  const own = CONFEDERATION_NAMES[name] ?? CONFEDERATIONS.find((confederation) => confederation === name);
  if (!own) fail("teams.confederation", `a confederation, not "${name}"`);
  return own;
}

/** Each national team's FIFA code and kit colours, from the national-football pack alone (its `teams` table is all a crest needs). */
export function parseNationalLooks(footballJson: string): Pick<NationalTeamData, "id" | "code" | "colours">[] {
  const looks = tableOf(packOf(footballJson), "teams");
  const ids = columnOf(looks, "teams", "id", null, isString);
  const codes = columnOf(looks, "teams", "code", ids.length, isString);
  const primary = columnOf(looks, "teams", "primaryColour", ids.length, isString);
  const secondary = columnOf(looks, "teams", "secondaryColour", ids.length, isString);
  return ids.map((id, row) => ({ id, code: codes[row] ?? "", colours: { primary: primary[row] ?? "", secondary: secondary[row] ?? "" } }));
}

/** Decodes the two national packs; throws on another format, a malformed column, or a player or fixture of a team they don't have. */
export function parseNationalFootball(teamsJson: string, footballJson: string): NationalFootball {
  const squadsPack = packOf(teamsJson);
  const football = packOf(footballJson);

  const teamTable = tableOf(squadsPack, "teams");
  const ids = columnOf(teamTable, "teams", "id", null, isString);
  const names = columnOf(teamTable, "teams", "name", ids.length, isString);
  const confederations = columnOf(teamTable, "teams", "confederation", ids.length, isString);
  const looks = tableOf(football, "teams");
  const lookIds = columnOf(looks, "teams", "id", null, isString);
  const codes = columnOf(looks, "teams", "code", lookIds.length, isString);
  const primary = columnOf(looks, "teams", "primaryColour", lookIds.length, isString);
  const secondary = columnOf(looks, "teams", "secondaryColour", lookIds.length, isString);
  const teams = ids.map((id, row): NationalTeamData => {
    const look = lookIds.indexOf(id);
    if (look < 0) fail("teams.id", `a code and colours for ${id}`);
    return { id, name: names[row] ?? id, confederation: confederationOf(confederations[row] ?? ""), code: codes[look] ?? "", colours: { primary: primary[look] ?? "", secondary: secondary[look] ?? "" } };
  });

  const players = tableOf(squadsPack, "players");
  const playerTeams = columnOf(players, "players", "team", null, isNumber);
  const rows = playerTeams.length;
  const playerIds = columnOf(players, "players", "id", rows, isString);
  const playerNames = columnOf(players, "players", "name", rows, isString);
  const roles = columnOf(players, "players", "role", rows, isRole);
  const births = columnOf(players, "players", "birthDate", rows, isStringOrNull);
  const clubIds = columnOf(players, "players", "clubTransfermarktId", rows, isStringOrNull);
  const clubNames = columnOf(players, "players", "clubName", rows, isStringOrNull);
  const values = columnOf(players, "players", "marketValueEur", rows, isNumberOrNull);
  const caps = columnOf(players, "players", "caps", rows, isNumberOrNull);
  const squads = playerTeams.map((team, row): NationalSquadEntry => {
    const teamId = ids[team];
    if (teamId === undefined) fail(`players.team[${row}]`, `a team row below ${ids.length}`);
    return {
      teamId,
      id: playerIds[row] ?? "",
      name: playerNames[row] ?? "",
      role: roles[row] ?? "meia",
      birthDate: births[row] ?? null,
      clubTransfermarktId: clubIds[row] ?? null,
      clubName: clubNames[row] ?? "",
      marketValueEur: values[row] ?? null,
      caps: caps[row] ?? null,
    };
  });

  const ranking = tableOf(football, "ranking");
  if (!isString(ranking.date) || !isString(ranking.source)) fail("ranking", "a date and a source");
  const rankTeams = columnOf(ranking, "ranking", "team", null, isString);
  const rankNames = columnOf(ranking, "ranking", "name", rankTeams.length, isString);
  const ranks = columnOf(ranking, "ranking", "rank", rankTeams.length, isNumber);
  const points = columnOf(ranking, "ranking", "points", rankTeams.length, isNumber);

  const fixtureTable = tableOf(football, "fixtures");
  const competitions = columnOf(fixtureTable, "fixtures", "competition", null, isString);
  const fixtureRows = competitions.length;
  const rounds = columnOf(fixtureTable, "fixtures", "round", fixtureRows, isString);
  const groups = columnOf(fixtureTable, "fixtures", "group", fixtureRows, isString);
  const dates = columnOf(fixtureTable, "fixtures", "date", fixtureRows, isString);
  const homes = columnOf(fixtureTable, "fixtures", "home", fixtureRows, isString);
  const aways = columnOf(fixtureTable, "fixtures", "away", fixtureRows, isString);
  const known = new Set(ids);
  const fixtures = competitions.map((competition, row): RealFixture => {
    const homeId = homes[row] ?? "";
    const awayId = aways[row] ?? "";
    if ((homeId && !known.has(homeId)) || (awayId && !known.has(awayId))) fail(`fixtures[${row}]`, "teams the pack has");
    return { competition, round: rounds[row] ?? "", group: groups[row] ?? "", date: dates[row] ?? "", homeId, awayId };
  });

  return {
    packVersion: `${squadsPack.packVersion}+${football.packVersion}`,
    teams,
    squads,
    ranking: { date: ranking.date, source: ranking.source, rows: rankTeams.map((teamId, row) => ({ teamId, name: rankNames[row] ?? teamId, rank: ranks[row] ?? 0, points: points[row] ?? 0 })) },
    fixtures,
  };
}

/** Reads the shipped national packs in Node; the Node modules are fetched on call so the browser can bundle the parser alone. */
export function loadNationalFootball(): NationalFootball {
  const { readFileSync } = process.getBuiltinModule("node:fs");
  const { dirname, join } = process.getBuiltinModule("node:path");
  const { fileURLToPath } = process.getBuiltinModule("node:url");
  const { gunzipSync } = process.getBuiltinModule("node:zlib");
  const pack = join(dirname(fileURLToPath(import.meta.url)), "..", "pack");
  const read = (file: string) => gunzipSync(readFileSync(join(pack, file))).toString("utf8");
  return parseNationalFootball(read("world/national-teams.pack.json.gz"), read("national-football.pack.json.gz"));
}
