import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { contrast } from "../clubs/clubCatalog.js";

const skin = readFileSync(join(import.meta.dirname, "win98.css"), "utf8");

/** The custom properties a rule of the skin sets, by name. */
function tokensOf(selector: string): Map<string, string> {
  const start = skin.indexOf(`${selector} {`);
  const block = skin.slice(start, skin.indexOf("}", start));
  return new Map([...block.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, name = "", value = ""]) => [name, value.trim()]));
}

const light = tokensOf('[data-skin="win98"]');
const dark = new Map([...light, ...tokensOf('[data-skin="win98"][data-theme="dark"]')]);

/** A token's colour, following var() to the token it names. */
function colourOf(tokens: Map<string, string>, name: string): string {
  const value = tokens.get(name) ?? "";
  const named = /^var\((--[\w-]+)\)$/.exec(value)?.[1];
  return named ? colourOf(tokens, named) : value;
}

test.each([
  ["light", light],
  ["dark", dark],
])("the 98 round's goalkeeper chip and later-dated text read at WCAG AA in the %s scheme", (_, tokens) => {
  expect(contrast(colourOf(tokens, "--on-yellow"), colourOf(tokens, "--pos-g"))).toBeGreaterThanOrEqual(4.5);
  for (const window of ["--w98-face", "--w98-light"]) expect(contrast(colourOf(tokens, "--later"), colourOf(tokens, window))).toBeGreaterThanOrEqual(4.5);
});
