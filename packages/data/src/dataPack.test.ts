import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { afterAll, describe, expect, it } from "vitest";
import { parseClubs } from "./clubs.js";
import { parseCompetitionMoney } from "./competition-money.js";
import { FIRST_PACK_VERSION, loadPack, parsePack, parsePackClubs } from "./dataPack.js";
import { parseFinances } from "./finances.js";
import { GROUP_OF_ROLE, parsePlayers } from "./players.js";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const csv = (name: string) => readFileSync(join(ROOT, "data", name), "utf8");

// Adds an older season's prize money to the database's latest snapshot, with a different season number.
const ADD_OLDER_MONEY = `
import json, sqlite3, sys
db = sqlite3.connect(sys.argv[1])
snapshot, season, body = db.execute("SELECT snapshot_id, season, body FROM competition_money").fetchone()
older = {**json.loads(body), "season": season - 1}
db.execute("INSERT INTO competition_money VALUES (?, 'BR', ?, ?)", (snapshot, season - 1, json.dumps(older)))
db.commit()
`;

function buildPackFromCsv(dir: string, editDatabase?: string): string {
  const db = join(dir, "boleiro.db");
  execFileSync("python3", [join(ROOT, "pipeline", "import_csv.py"), join(ROOT, "data"), db]);
  if (editDatabase) execFileSync("python3", ["-c", editDatabase, db]);
  execFileSync("python3", [join(ROOT, "pipeline", "build_pack.py"), db, dir]);
  return gunzipSync(readFileSync(join(dir, "brazil.pack.json.gz"))).toString("utf8");
}

describe("the data pack", () => {
  const dir = mkdtempSync(join(tmpdir(), "boleiro-pack-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const built = buildPackFromCsv(dir);

  it("loads the same game inputs as the CSV files after going through the master database", () => {
    const pack = parsePack(built);
    expect(pack.clubs).toStrictEqual(parseClubs(csv("clubs.csv")));
    expect(pack.players).toStrictEqual(parsePlayers(csv("players.csv")));
    expect(pack.finances).toStrictEqual(parseFinances(csv("finances.csv")));
    expect(pack.competitionMoney).toStrictEqual(parseCompetitionMoney(csv("competition-money.json")));
  });

  it("ships the pack the pipeline builds from data/", () => {
    expect(loadPack()).toStrictEqual(parsePack(built));
  });

  it("names its version after its content, so a rebuild of the same data keeps it", () => {
    const again = buildPackFromCsv(mkdtempSync(join(dir, "again-")));
    expect(parsePack(again).packVersion).toBe(parsePack(built).packVersion);
    expect(parsePack(built).packVersion).toMatch(/^br-[0-9a-f]{12}$/);
  });

  it("gives every player his positions, Transfermarkt's main one first, row for row with the players", () => {
    const pack = parsePack(built);
    expect(pack.positions).toHaveLength(pack.players.length);
    pack.positions.forEach((roles, row) => {
      const main = roles[0];
      expect(main && GROUP_OF_ROLE[main]).toBe(pack.players[row]?.group);
      expect(new Set(roles).size).toBe(roles.length);
    });
    expect(pack.positions.filter((roles) => roles.length > 1).length).toBeGreaterThan(400);
  });

  it("holds the last real eleven of every Série A and B club, each starter a player of that club", () => {
    const pack = parsePack(built);
    const withLineup = new Set(pack.lineups.map((lineup) => lineup.clubId));
    for (const club of pack.clubs.filter((c) => c.division === "A" || c.division === "B")) expect(withLineup, club.id).toContain(club.id);
    for (const lineup of pack.lineups) {
      expect(lineup.starters).toHaveLength(11);
      for (const row of lineup.starters) if (row !== null) expect(pack.players[row]?.clubId).toBe(lineup.clubId);
    }
  });

  it("never renames the first Brazil pack, whatever pack ships now, since saves from before data packs are read as it", () => {
    expect(FIRST_PACK_VERSION).toBe("br-a49b7692d13f");
  });

  it("takes the latest season's prize money when the database holds several", () => {
    const withOlderMoney = buildPackFromCsv(mkdtempSync(join(dir, "older-money-")), ADD_OLDER_MONEY);
    expect(parsePack(withOlderMoney).competitionMoney).toStrictEqual(parsePack(built).competitionMoney);
  });

  it("decodes a pack cut down to its clubs into the same clubs as the whole pack", () => {
    const { format, clubs } = JSON.parse(built);
    expect(parsePackClubs(JSON.stringify({ format, clubs }))).toStrictEqual(parsePack(built).clubs);
  });

  it("rejects a pack of another format", () => {
    const other = { ...JSON.parse(built), format: 2 };
    expect(() => parsePack(JSON.stringify(other))).toThrow(/format/);
    expect(() => parsePackClubs(JSON.stringify(other))).toThrow(/format/);
  });

  it("rejects a pack whose columns disagree on the number of rows", () => {
    const pack = JSON.parse(built);
    pack.players.strength.pop();
    expect(() => parsePack(JSON.stringify(pack))).toThrow(/players/);
  });
});
