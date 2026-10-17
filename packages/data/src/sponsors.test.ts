import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { afterAll, describe, expect, it } from "vitest";
import { parseAssetManifest } from "./assetManifest.js";
import { parseCsv } from "./csv.js";
import { loadSponsorsPack, parseSponsorsPack, SPONSORS_PACK_FILE } from "./sponsors.js";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const PACK = join(import.meta.dirname, "..", "pack");
const csv = (name: string) => parseCsv(readFileSync(join(ROOT, "data", name), "utf8"));

function buildSponsorsPack(dir: string): string {
  const db = join(dir, "boleiro.db");
  execFileSync("python3", [join(ROOT, "pipeline", "import_csv.py"), join(ROOT, "data"), db]);
  execFileSync("python3", [join(ROOT, "pipeline", "build_pack.py"), db, dir]);
  return gunzipSync(readFileSync(join(dir, SPONSORS_PACK_FILE))).toString("utf8");
}

describe("the sponsors pack", () => {
  const dir = mkdtempSync(join(tmpdir(), "boleiro-sponsors-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const built = buildSponsorsPack(dir);

  it("ships the pack the pipeline builds from data/, versioned by its content", () => {
    expect(loadSponsorsPack()).toStrictEqual(parseSponsorsPack(built));
    expect(parseSponsorsPack(built).packVersion).toMatch(/^sp-[0-9a-f]{12}$/);
  });

  it("holds every kit deal of data/sponsors.csv with the press's values joined in", () => {
    const pack = parseSponsorsPack(built);
    expect(pack.deals).toHaveLength(csv("sponsors.csv").length);
    for (const value of csv("sponsor-values.csv")) {
      const deal = pack.deals.find((d) => d.clubId === value.club_id && d.slot === value.slot && d.brandId === value.brand_id);
      expect(deal, `${value.club_id} ${value.slot} ${value.brand_id}`).toMatchObject({ yearly: Number(value.yearly_value), valueSource: value.source });
    }
  });

  it("names a kit maker for every Série A club and a master sponsor for all but the four whose chest was empty before the ban", () => {
    const pack = parseSponsorsPack(built);
    const serieA = csv("clubs.csv").filter((club) => club.division === "A");
    const hasDeal = (clubId: string | undefined, slot: string) => pack.deals.some((d) => d.clubId === clubId && d.slot === slot);
    for (const club of serieA) expect(hasDeal(club.id, "kit"), club.id).toBe(true);
    // The pre-ban table lists no main sponsor for these four.
    expect(serieA.filter((club) => !hasDeal(club.id, "master")).map((club) => club.id).sort()).toEqual(["coritiba-pr", "gremio-rs", "internacional-rs", "santos-sp"]);
  });

  it("keeps an offer pool of brands with a size, kit makers among them", () => {
    const pool = parseSponsorsPack(built).brands.filter((b) => b.isPool);
    expect(pool.length).toBeGreaterThan(100);
    for (const brand of pool) expect(brand.size, brand.id).not.toBeNull();
    expect(pool.filter((b) => b.sector === "kit").length).toBeGreaterThan(10);
  });

  it("ships a logo for every brand data/brands.csv found one for, each file on disk", () => {
    const manifest = parseAssetManifest(readFileSync(join(PACK, "sponsors", "assets.json"), "utf8"));
    const withLogo = csv("brands.csv").filter((brand) => brand.logo_path);
    expect(Object.keys(manifest.brands).sort()).toEqual(withLogo.map((brand) => brand.id).sort());
    for (const [id, image] of Object.entries(manifest.images)) {
      for (const box of image.boxes) for (const format of image.formats) expect(existsSync(join(PACK, "sponsors", "assets", `${id}-${box}.${format}`))).toBe(true);
    }
  });

  it("rejects a deal whose brand is not in the pack", () => {
    const pack = JSON.parse(built);
    pack.deals.brand[0] = pack.brands.id.length;
    expect(() => parseSponsorsPack(JSON.stringify(pack))).toThrow(/deals.brand/);
  });
});
