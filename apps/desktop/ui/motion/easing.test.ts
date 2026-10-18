import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { DURATION, EASE } from "./easing.js";

const album = readFileSync(join(import.meta.dirname, "../../../../packages/design-tokens/album.css"), "utf8");

/** The value of a custom property in album.css's light :root, spaces squeezed out. */
const cssToken = (name: string) => album.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1]?.replace(/\s+/g, "").replace(/(^|[(,])0\./g, "$1.");
const squeezed = (value: string) => value.replace(/\s+/g, "").replace(/(^|[(,])0\./g, "$1.");

test("scripted motion eases and times exactly like the stylesheet's motion tokens", () => {
  expect(squeezed(EASE.out)).toBe(cssToken("--e-out"));
  expect(squeezed(EASE.inOut)).toBe(cssToken("--e-in-out"));
  expect(squeezed(EASE.slap)).toBe(cssToken("--e-slap"));
  expect(squeezed(EASE.peel)).toBe(cssToken("--e-peel"));
  expect(`${DURATION.fast}ms`).toBe(cssToken("--t-fast"));
  expect(`${DURATION.base}ms`).toBe(cssToken("--t-base"));
  expect(`${DURATION.slow}ms`).toBe(cssToken("--t-slow"));
  expect(`${DURATION.stamp}ms`).toBe(cssToken("--t-stamp"));
});
