import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { afterAll, describe, expect, it } from "vitest";
import { parseClubs } from "./clubs.js";
import { parseCompetitionMoney } from "./competition-money.js";
import { FIRST_PACK_VERSION, loadPack, parsePack } from "./dataPack.js";
import { parseFinances } from "./finances.js";
import { parsePlayers } from "./players.js";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const csv = (name: string) => readFileSync(join(ROOT, "data", name), "utf8");

function buildPackFromCsv(dir: string): string {
  const db = join(dir, "boleiro.db");
  execFileSync("python3", [join(ROOT, "pipeline", "import_csv.py"), join(ROOT, "data"), db]);
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

  it("never renames the first Brazil pack, whatever pack ships now, since saves from before data packs are read as it", () => {
    expect(FIRST_PACK_VERSION).toBe("br-a49b7692d13f");
  });

  it("rejects a pack of another format", () => {
    const other = { ...JSON.parse(built), format: 2 };
    expect(() => parsePack(JSON.stringify(other))).toThrow(/format/);
  });

  it("rejects a pack whose columns disagree on the number of rows", () => {
    const pack = JSON.parse(built);
    pack.players.strength.pop();
    expect(() => parsePack(JSON.stringify(pack))).toThrow(/players/);
  });
});
