/**
 * Reads a file under `data/` in Node. The Node modules are fetched on call, not imported, so the
 * browser can bundle the parsers next to this without pulling in `node:fs`.
 */
export function readDataFile(name: string): string {
  const { readFileSync } = process.getBuiltinModule("node:fs");
  const { dirname, join } = process.getBuiltinModule("node:path");
  const { fileURLToPath } = process.getBuiltinModule("node:url");
  return readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "data", name), "utf8");
}
