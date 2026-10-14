import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { imageFileOf, parseAssetManifest } from "./assetManifest.js";
import { loadPack } from "./dataPack.js";

const MANIFEST = JSON.stringify({
  format: 1,
  images: {
    abc: { kind: "crest", width: 139, height: 181, boxes: [64, 128, 256], formats: ["webp", "avif"] },
    def: { kind: "scoreboard_crest", width: 500, height: 500, boxes: [64, 128, 256], formats: ["webp", "avif"] },
  },
  clubs: { "bahia-ba": { crest: "abc", scoreboardCrest: "def" }, "jacuipense-ba": { crest: "abc" } },
});

describe("imageFileOf", () => {
  const manifest = parseAssetManifest(MANIFEST);

  it("picks the smallest variant that fills the display size", () => {
    expect(imageFileOf(manifest, "bahia-ba", "crest", 46, "webp")).toBe("crest/abc-64.webp");
    expect(imageFileOf(manifest, "bahia-ba", "crest", 64, "webp")).toBe("crest/abc-64.webp");
    expect(imageFileOf(manifest, "bahia-ba", "crest", 65, "avif")).toBe("crest/abc-128.avif");
  });

  it("falls back to the largest variant for a display bigger than every box", () => {
    expect(imageFileOf(manifest, "bahia-ba", "scoreboardCrest", 400, "webp")).toBe("scoreboard_crest/def-256.webp");
  });

  it("gives nothing for a club or an image the manifest does not have", () => {
    expect(imageFileOf(manifest, "nobody", "crest", 64, "webp")).toBeNull();
    expect(imageFileOf(manifest, "jacuipense-ba", "scoreboardCrest", 64, "webp")).toBeNull();
  });
});

describe("the shipped asset manifest", () => {
  it("has a crest for every club the data pack ships", () => {
    const shipped = parseAssetManifest(readFileSync(join(import.meta.dirname, "..", "pack", "assets.json"), "utf8"));
    const missing = loadPack().clubs.filter((club) => imageFileOf(shipped, club.id, "crest", 64, "webp") === null);
    expect(missing.map((club) => club.id)).toEqual([]);
  });
});

describe("parseAssetManifest", () => {
  it("rejects a manifest of another format", () => {
    expect(() => parseAssetManifest(JSON.stringify({ ...JSON.parse(MANIFEST), format: 2 }))).toThrow(/format/);
  });

  it("rejects a club pointing at an image it does not list", () => {
    const broken = { ...JSON.parse(MANIFEST), clubs: { "bahia-ba": { crest: "zzz" } } };
    expect(() => parseAssetManifest(JSON.stringify(broken))).toThrow(/zzz/);
  });
});
