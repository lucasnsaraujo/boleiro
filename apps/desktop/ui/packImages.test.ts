import { readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { isPackImage } from "./packImages.js";

const PACK = join(import.meta.dirname, "../../../packages/data/pack");

/** The first image file of each folder the screens glob their pictures from. */
const firstImageOf = (folder: string) => join(PACK, folder, readdirSync(join(PACK, folder)).find((name) => name.endsWith(".webp")) ?? "");

test("every pack's images stay files: Brazil's crests, the world's, the national teams' and the sponsors' logos", () => {
  const images = ["assets/crest", "world/assets/crest", "national/assets/crest", "sponsors/assets/logo", "sponsors/assets/badge"].map(firstImageOf);
  expect(images.filter((file) => !isPackImage(file))).toEqual([]);
});

test("the app's own small pictures are left to the build's inline rule", () => {
  expect(isPackImage(join(import.meta.dirname, "../../../design/logo/boleiro-icon-small.svg"))).toBe(false);
});
