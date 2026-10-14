import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterAll, describe, expect, it } from "vitest";
import { gunzipImports } from "./gunzipImports.js";

const MODULE = /^export default (".*");$/s;

function importedText(id: string): string {
  const code = gunzipImports().load(id);
  const literal = code?.match(MODULE)?.[1];
  if (literal === undefined) throw new Error(`not a text module: ${code}`);
  const text: unknown = JSON.parse(literal);
  if (typeof text !== "string") throw new Error(`not a string: ${literal}`);
  return text;
}

describe("gunzipImports", () => {
  const dir = mkdtempSync(join(tmpdir(), "boleiro-gunzip-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, "pack.json.gz");
  const json = JSON.stringify({ format: 1, clubs: { id: ["bahia-ba"] }, players: { name: ["Everton Ribeiro"] } });
  writeFileSync(file, gzipSync(json));

  it("gives a gzipped file's text", () => {
    expect(importedText(`${file}?gunzip`)).toBe(json);
  });

  it("keeps only the asked top-level keys of a gzipped JSON file", () => {
    expect(JSON.parse(importedText(`${file}?gunzip&keys=format,clubs`))).toStrictEqual({ format: 1, clubs: { id: ["bahia-ba"] } });
  });

  it("leaves other imports to the next plugin", () => {
    expect(gunzipImports().load(file)).toBeNull();
    expect(gunzipImports().load(`${file}?raw`)).toBeNull();
  });
});
