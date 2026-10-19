import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

function keptKeys(json: string, keys: readonly string[]): string {
  const document: unknown = JSON.parse(json);
  if (typeof document !== "object" || document === null) throw new Error("?gunzip&keys needs a JSON object");
  return JSON.stringify(Object.fromEntries(Object.entries(document).filter(([key]) => keys.includes(key))));
}

/**
 * Vite plugin: `import text from "<file>.gz?gunzip"` gives the file's unzipped text at build time,
 * so the app and its worker get the data pack without an async load. Node reads it with `loadPack`.
 * `?gunzip&keys=format,clubs` keeps only those top-level keys of a JSON file, so a screen that
 * needs one table doesn't bundle the whole pack.
 */
export function gunzipImports() {
  return {
    name: "boleiro:gunzip-imports",
    enforce: "pre" as const,
    load(id: string): string | null {
      const [file = "", query = ""] = id.split("?");
      const params = new URLSearchParams(query);
      if (!params.has("gunzip")) return null;
      const text = gunzipSync(readFileSync(file)).toString("utf8");
      const keys = params.get("keys");
      return `export default ${JSON.stringify(keys === null ? text : keptKeys(text, keys.split(",")))};`;
    },
  };
}
