import manifestJson from "@boleiro/data/pack/national/assets.json?raw";
import { imageFileOf, parseAssetManifest } from "@boleiro/data/assetManifest";

// The federations' crests from Transfermarkt, by national team id, in 64 and 128 px only (pipeline/fetch_national_crests.py).
const ASSETS = parseAssetManifest(manifestJson);
const FILES = import.meta.glob<string>("./crest/*.webp", {
  base: "../../../../packages/data/pack/national/assets/",
  eager: true,
  query: "?url",
  import: "default",
});

/** The national team's crest in the smallest variant at least `size` device pixels tall or wide, or null when it has none. */
export function nationalCrestUrlOf(teamId: string, size = 64): string | null {
  const file = imageFileOf(ASSETS, teamId, "crest", size, "webp");
  return file ? (FILES[`./${file}`] ?? null) : null;
}
