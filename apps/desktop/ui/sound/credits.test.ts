import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { isFreeLicence, parseCredits } from "./credits.js";

const SOUNDS = join(import.meta.dirname, "../../../../assets/sounds");
const files = readdirSync(SOUNDS).filter((name) => name !== "CREDITS.md");
const credits = parseCredits(readFileSync(join(SOUNDS, "CREDITS.md"), "utf8"));

test("every sound file has a credits row with a free licence, an author and its source page", () => {
  const missing = files.filter((file) => !credits.some((row) => row.file === file));
  expect(missing).toEqual([]);
  for (const row of credits) {
    expect(isFreeLicence(row.licence), `${row.file}: ${row.licence}`).toBe(true);
    expect(row.author, row.file).not.toBe("");
    expect(row.source, row.file).toMatch(/^https:\/\//);
  }
});

test("no credits row points at a file that isn't there", () => {
  expect(credits.map((row) => row.file).filter((file) => !files.includes(file))).toEqual([]);
});

test("the sounds are compressed and stay under 15 MB together", () => {
  expect(files.filter((file) => !/\.(mp3|ogg|opus)$/.test(file))).toEqual([]);
  const bytes = files.reduce((sum, file) => sum + statSync(join(SOUNDS, file)).size, 0);
  expect(bytes).toBeLessThan(15 * 1024 * 1024);
});

test("only CC0, the Pixabay licence and CC BY count as free", () => {
  expect(["CC0 1.0", "Pixabay Content License", "CC BY 4.0", "CC BY 3.0"].every(isFreeLicence)).toBe(true);
  expect(["CC BY-NC 4.0", "CC BY-SA 4.0", "", "All rights reserved"].some(isFreeLicence)).toBe(false);
});

test("a credits table is read row by row, skipping its header", () => {
  const md = [
    "# Credits",
    "",
    "| File | Sound | Author | Licence | Source | Edit |",
    "| --- | --- | --- | --- | --- | --- |",
    "| a.mp3 | Crowd | felix.blume | CC0 1.0 | https://freesound.org/s/1/ | cut |",
  ].join("\n");
  expect(parseCredits(md)).toEqual([{ file: "a.mp3", sound: "Crowd", author: "felix.blume", licence: "CC0 1.0", source: "https://freesound.org/s/1/", edit: "cut" }]);
});

test("the sounds keep to their 2 MB budget, apart from the images'", () => {
  const bytes = files.reduce((sum, file) => sum + statSync(join(SOUNDS, file)).size, 0);
  expect(bytes).toBeLessThan(2 * 1024 * 1024);
});
