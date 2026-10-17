import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAssetManifest } from "./assetManifest.js";
import { PACK_FILE } from "./dataPack.js";
import { SPONSORS_PACK_FILE } from "./sponsors.js";

const PACK = join(import.meta.dirname, "..", "pack");
const manifest = parseAssetManifest(readFileSync(join(PACK, "assets.json"), "utf8"));

// Bytes per asset class: the Brazil-only sizes of 2026-10 plus about 25% headroom (README, "Data
// pack"). Raise one on purpose, with the new size in the commit, when more of the world lands.
const IMAGE_BUDGETS: Record<string, { largestFile: number; total: number }> = {
  // today 16,186 and 6,822,086 (281 crests, 3 boxes, WebP + AVIF)
  crest: { largestFile: 20_000, total: 8_500_000 },
  // today 30,508 and 1,372,720 (40 ESPN logos)
  scoreboard_crest: { largestFile: 38_000, total: 1_700_000 },
};
// The sponsors' logos (pack/sponsors/), WebP in two boxes: marks on a clear ground and badges (opaque tiles).
const SPONSORS_PACK = join(PACK, "sponsors");
const sponsorsManifest = parseAssetManifest(readFileSync(join(SPONSORS_PACK, "assets.json"), "utf8"));
const LOGO_BUDGETS: Record<string, { largestFile: number; total: number }> = {
  // today 18,732 and 2,114,206 (236 logos, 2 boxes)
  logo: { largestFile: 24_000, total: 2_650_000 },
  // today 18,284 and 384,104 (70 badges, 2 boxes)
  badge: { largestFile: 24_000, total: 480_000 },
};
// Every image of the v1 world, Brazil's, the world scrape's (pack/world/) and the sponsors', against
// SPEC §4.3's ~25 MB: today 18,050,650 bytes, 2,498,310 of them the sponsors' logos.
const ALL_IMAGES_BUDGET = 20_000_000;
const WORLD_PACK = join(PACK, "world");
const worldManifest = parseAssetManifest(readFileSync(join(WORLD_PACK, "assets.json"), "utf8"));
// today 60,278, 53,950, 24,707 and 45,520
const FILE_BUDGETS: Record<string, number> = { [PACK_FILE]: 75_000, "assets.json": 67_000, [SPONSORS_PACK_FILE]: 31_000, "sponsors/assets.json": 57_000 };

function filesOf(kind: string | null, of = manifest, root = PACK): string[] {
  return Object.entries(of.images)
    .filter(([, image]) => kind === null || image.kind === kind)
    .flatMap(([id, image]) => image.boxes.flatMap((box) => image.formats.map((format) => join(root, "assets", `${id}-${box}.${format}`))));
}

describe("asset size budgets", () => {
  const kinds = [...new Set(Object.values(manifest.images).map((image) => image.kind))];

  it("gives every image class in the manifest a budget", () => {
    expect(kinds.filter((kind) => !(kind in IMAGE_BUDGETS))).toEqual([]);
  });

  it("finds every file the manifest lists", () => {
    expect(kinds.flatMap((kind) => filesOf(kind)).filter((file) => !existsSync(file))).toEqual([]);
  });

  it.each(Object.entries(IMAGE_BUDGETS))("keeps %s images within budget", (kind, budget) => {
    const sizes = filesOf(kind).map((file) => statSync(file).size);
    expect(sizes.length).toBeGreaterThan(0);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(budget.largestFile);
    expect(sizes.reduce((sum, size) => sum + size, 0)).toBeLessThanOrEqual(budget.total);
  });

  it("gives every logo class of the sponsors' manifest a budget and finds its files", () => {
    const logoKinds = [...new Set(Object.values(sponsorsManifest.images).map((image) => image.kind))];
    expect(logoKinds.filter((kind) => !(kind in LOGO_BUDGETS))).toEqual([]);
    expect(filesOf(null, sponsorsManifest, SPONSORS_PACK).filter((file) => !existsSync(file))).toEqual([]);
  });

  it.each(Object.entries(LOGO_BUDGETS))("keeps the sponsors' %s images within budget", (kind, budget) => {
    const sizes = filesOf(kind, sponsorsManifest, SPONSORS_PACK).map((file) => statSync(file).size);
    expect(sizes.length).toBeGreaterThan(0);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(budget.largestFile);
    expect(sizes.reduce((sum, size) => sum + size, 0)).toBeLessThanOrEqual(budget.total);
  });

  it("keeps every image of the v1 world, Brazil's, the world's and the sponsors', within SPEC's ~25 MB", () => {
    const files = [...filesOf(null), ...filesOf(null, worldManifest, WORLD_PACK), ...filesOf(null, sponsorsManifest, SPONSORS_PACK)];
    expect(files.reduce((sum, file) => sum + statSync(file).size, 0)).toBeLessThanOrEqual(ALL_IMAGES_BUDGET);
  });

  it.each(Object.entries(FILE_BUDGETS))("keeps %s within budget", (file, budget) => {
    expect(statSync(join(PACK, file)).size).toBeLessThanOrEqual(budget);
  });
});
