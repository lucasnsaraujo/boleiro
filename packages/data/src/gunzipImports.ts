import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const QUERY = "?gunzip";

/**
 * Vite plugin: `import text from "<file>.gz?gunzip"` gives the file's unzipped text at build time,
 * so the app and its worker get the data pack without an async load. Node reads it with `loadPack`.
 */
export function gunzipImports() {
  return {
    name: "boleiro:gunzip-imports",
    enforce: "pre" as const,
    load(id: string): string | null {
      if (!id.endsWith(QUERY)) return null;
      const text = gunzipSync(readFileSync(id.slice(0, -QUERY.length))).toString("utf8");
      return `export default ${JSON.stringify(text)};`;
    },
  };
}
