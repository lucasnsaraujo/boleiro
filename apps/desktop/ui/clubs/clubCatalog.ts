import manifestJson from "@boleiro/data/pack/assets.json?raw";
import packClubs from "@boleiro/data/pack/brazil.pack.json.gz?gunzip&keys=format,clubs";
import { imageFileOf, parseAssetManifest } from "@boleiro/data/assetManifest";
import type { Club } from "@boleiro/data/clubs";
import { parsePackClubs } from "@boleiro/data/dataPack";

/**
 * Every club in the bundled data pack, for screens that only need names, colours and crests. Only
 * the clubs table is bundled here; the players and money stay in the engine worker's copy.
 */
export const CLUBS: readonly Club[] = parsePackClubs(packClubs);

const BY_ID = new Map(CLUBS.map((club) => [club.id, club]));
const ASSETS = parseAssetManifest(manifestJson);
// Keys are the manifest's paths under `pack/assets/`, kept short since every one lands in the main script.
// Only WebP ships: every desktop webview reads it, and the AVIF files stay in the pack for later clients.
const CREST_FILES = import.meta.glob<string>("./crest/*.webp", {
  base: "../../../../packages/data/pack/assets/",
  eager: true,
  query: "?url",
  import: "default",
});

export function clubById(id: string): Club | null {
  return BY_ID.get(id) ?? null;
}

/** The club's crest in the smallest variant at least `size` device pixels tall or wide, or null when it has none. */
export function crestUrlOf(clubId: string, size = 64): string | null {
  const file = imageFileOf(ASSETS, clubId, "crest", size, "webp");
  return file ? (CREST_FILES[`./${file}`] ?? null) : null;
}

/** Up to three letters for a generated crest: "Bahia" gives BAH, "São Paulo" SP, "Atlético-MG" AMG. */
export function initialsOf(name: string): string {
  const words = name.split(/[\s-]+/).filter((word) => word.length > 0);
  if (words.length === 1) return (words[0] ?? "").slice(0, 3).toUpperCase();
  return words
    .map((word) => (word === word.toUpperCase() ? word : word.charAt(0)))
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

function luminance(hex: string): number {
  const channels = (hex.replace("#", "").match(/../g) ?? []).map((pair) => parseInt(pair, 16) / 255);
  const [r = 0, g = 0, b = 0] = channels.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

// WCAG AA for normal text.
const READABLE = 4.5;

/**
 * Club-colour plate, the way Brasfoot paints names: the second colour on the first when it reads, else white or the
 * album's ink. On a mid red or green neither quite reaches AA, and pure black does (white or black always clears 4.58:1).
 */
export function plateColours({ primary, secondary }: Club["colours"]): { background: string; text: string } {
  if (contrast(primary, secondary) >= READABLE) return { background: primary, text: secondary };
  const clearest = (inks: readonly string[]) => inks.reduce((best, ink) => (contrast(primary, ink) > contrast(primary, best) ? ink : best));
  const ink = clearest(["#ffffff", "#0a0a0a"]);
  return { background: primary, text: contrast(primary, ink) >= READABLE ? ink : clearest(["#ffffff", "#000000"]) };
}
