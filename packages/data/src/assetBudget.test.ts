import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAssetManifest } from "./assetManifest.js";
import { PACK_FILE } from "./dataPack.js";

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
// today 60,278 and 49,218
const FILE_BUDGETS: Record<string, number> = { [PACK_FILE]: 75_000, "assets.json": 62_000 };

function filesOf(kind: string): string[] {
  return Object.entries(manifest.images)
    .filter(([, image]) => image.kind === kind)
    .flatMap(([hash, image]) => image.boxes.flatMap((box) => image.formats.map((format) => join(PACK, "assets", kind, `${hash}-${box}.${format}`))));
}

describe("asset size budgets", () => {
  const kinds = [...new Set(Object.values(manifest.images).map((image) => image.kind))];

  it("gives every image class in the manifest a budget", () => {
    expect(kinds.filter((kind) => !(kind in IMAGE_BUDGETS))).toEqual([]);
  });

  it("finds every file the manifest lists", () => {
    expect(kinds.flatMap(filesOf).filter((file) => !existsSync(file))).toEqual([]);
  });

  it.each(Object.entries(IMAGE_BUDGETS))("keeps %s images within budget", (kind, budget) => {
    const sizes = filesOf(kind).map((file) => statSync(file).size);
    expect(sizes.length).toBeGreaterThan(0);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(budget.largestFile);
    expect(sizes.reduce((sum, size) => sum + size, 0)).toBeLessThanOrEqual(budget.total);
  });

  it.each(Object.entries(FILE_BUDGETS))("keeps %s within budget", (file, budget) => {
    expect(statSync(join(PACK, file)).size).toBeLessThanOrEqual(budget);
  });
});
