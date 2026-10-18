import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { brotliDecompressSync } from "node:zlib";
import { expect, test } from "vitest";

const ICONS = join(import.meta.dirname, "../../../../packages/design-tokens/icons");
const SOURCES = [join(import.meta.dirname, ".."), join(import.meta.dirname, "../../../../packages/game-client/src")];
// WOFF2's table directory names its common tables by an index into this list (cmap first); 63 means the tag follows.
const KNOWN_TAGS = ["cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ", "fpgm", "glyf", "loca", "prep"];

/** Every icon name the subset's stylesheet gives a codepoint. */
const codepoints = new Map(
  [...readFileSync(join(ICONS, "phosphor.css"), "utf8").matchAll(/\.ph-([a-z0-9-]+):before \{ content: "\\([0-9a-f]+)"; \}/g)].map(([, name = "", hex = ""]) => [name, parseInt(hex, 16)]),
);

/**
 * The icons the screens name: in a `ph-<name>` class, in an `icon` field or default, in a table of `…ICONS`, or as the icon
 * argument of a moment's buttons. A class built from a variable (`ph-arrow-${push}`) is left to the names it is built from.
 */
function iconsUsed(): Map<string, string> {
  const used = new Map<string, string>();
  for (const root of SOURCES) {
    for (const file of readdirSync(root, { recursive: true, encoding: "utf8" })) {
      if (!/\.(tsx?|css)$/.test(file) || file.includes(".test.")) continue;
      const text = readFileSync(join(root, file), "utf8");
      const names = [
        ...[...text.matchAll(/(?<![\w-])ph-([a-z0-9]+(?:-[a-z0-9]+)*)(?![\w$-])/g)].map(([, name]) => name),
        ...[...text.matchAll(/\bicon\??\s*[:=]\s*"([a-z0-9-]+)"/g)].map(([, name]) => name),
        ...[...text.matchAll(/[A-Z_]*ICONS\b[^=\n]*=\s*\{([^}]*)\}/g)].flatMap(([, table = ""]) => [...table.matchAll(/"([a-z0-9-]+)"/g)].map(([, name]) => name)),
        ...[...text.matchAll(/\b(?:side|go)\("[^"]*",\s*"[^"]*",\s*"([a-z0-9-]+)"/g)].map(([, name]) => name),
      ];
      for (const name of names) if (name && name !== "bold" && name !== "fill") used.set(name, file);
    }
  }
  return used;
}

/** Reads a WOFF2 base-128 number at `at`, returning it and the offset after it. */
function base128(bytes: Buffer, at: number): [number, number] {
  let value = 0;
  for (let i = at; ; i++) {
    const byte = bytes[i] ?? 0;
    value = value * 128 + (byte & 0x7f);
    if (!(byte & 0x80)) return [value, i + 1];
  }
}

/** The codepoints a WOFF2 font maps to a glyph, from its cmap (formats 4 and 12). */
function mappedCodepoints(file: string): Set<number> {
  const woff2 = readFileSync(join(ICONS, file));
  let at = 48;
  const tables: { tag: string; length: number }[] = [];
  for (let i = 0; i < woff2.readUInt16BE(12); i++) {
    const flags = woff2[at++] ?? 0;
    const tag = (flags & 0x3f) === 0x3f ? woff2.toString("latin1", at, (at += 4)) : (KNOWN_TAGS[flags & 0x3f] ?? "????");
    let length;
    [length, at] = base128(woff2, at);
    const version = flags >> 6;
    if ((tag === "glyf" || tag === "loca") === (version === 0)) [length, at] = base128(woff2, at);
    tables.push({ tag, length });
  }
  const data = brotliDecompressSync(woff2.subarray(at, at + woff2.readUInt32BE(20)));
  const cmapAt = tables.slice(0, tables.findIndex(({ tag }) => tag === "cmap")).reduce((sum, { length }) => sum + length, 0);
  const cmap = data.subarray(cmapAt);
  const mapped = new Set<number>();
  for (let i = 0; i < cmap.readUInt16BE(2); i++) {
    const sub = cmap.subarray(cmap.readUInt32BE(4 + i * 8 + 4));
    if (sub.readUInt16BE(0) === 4) {
      const segments = sub.readUInt16BE(6) / 2;
      for (let s = 0; s < segments; s++) {
        const end = sub.readUInt16BE(14 + s * 2);
        const start = sub.readUInt16BE(16 + segments * 2 + s * 2);
        const delta = sub.readInt16BE(16 + segments * 4 + s * 2);
        const rangeAt = 16 + segments * 6 + s * 2;
        const range = sub.readUInt16BE(rangeAt);
        for (let c = start; c <= end && c !== 0xffff; c++) {
          const glyph = range === 0 ? (c + delta) & 0xffff : sub.readUInt16BE(rangeAt + range + (c - start) * 2);
          if (glyph !== 0) mapped.add(c);
        }
      }
    } else if (sub.readUInt16BE(0) === 12) {
      for (let g = 0; g < sub.readUInt32BE(12); g++) for (let c = sub.readUInt32BE(16 + g * 12); c <= sub.readUInt32BE(20 + g * 12); c++) mapped.add(c);
    }
  }
  return mapped;
}

test("every Phosphor icon the screens use has a codepoint in the shipped stylesheet", () => {
  const missing = [...iconsUsed()].filter(([name]) => !codepoints.has(name)).map(([name, file]) => `${name} (${file})`);
  expect(missing).toEqual([]);
});

test("both shipped Phosphor fonts draw a glyph for every icon the stylesheet names", () => {
  for (const font of ["phosphor-bold.woff2", "phosphor-fill.woff2"]) {
    const mapped = mappedCodepoints(font);
    expect([...codepoints].filter(([, codepoint]) => !mapped.has(codepoint)).map(([name]) => `${name} (${font})`)).toEqual([]);
  }
});
