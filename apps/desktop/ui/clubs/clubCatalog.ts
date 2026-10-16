import manifestJson from "@boleiro/data/pack/assets.json?raw";
import packClubs from "@boleiro/data/pack/brazil.pack.json.gz?gunzip&keys=format,clubs";
import worldManifestJson from "@boleiro/data/pack/world/assets.json?raw";
import argentina from "@boleiro/data/pack/world/ar.pack.json.gz?gunzip&keys=format,clubs";
import bolivia from "@boleiro/data/pack/world/bo.pack.json.gz?gunzip&keys=format,clubs";
import chile from "@boleiro/data/pack/world/cl.pack.json.gz?gunzip&keys=format,clubs";
import colombia from "@boleiro/data/pack/world/co.pack.json.gz?gunzip&keys=format,clubs";
import ecuador from "@boleiro/data/pack/world/ec.pack.json.gz?gunzip&keys=format,clubs";
import peru from "@boleiro/data/pack/world/pe.pack.json.gz?gunzip&keys=format,clubs";
import paraguay from "@boleiro/data/pack/world/py.pack.json.gz?gunzip&keys=format,clubs";
import uruguay from "@boleiro/data/pack/world/uy.pack.json.gz?gunzip&keys=format,clubs";
import venezuela from "@boleiro/data/pack/world/ve.pack.json.gz?gunzip&keys=format,clubs";
import armenia from "@boleiro/data/pack/world/am.pack.json.gz?gunzip&keys=format,clubs";
import austria from "@boleiro/data/pack/world/at.pack.json.gz?gunzip&keys=format,clubs";
import azerbaijan from "@boleiro/data/pack/world/az.pack.json.gz?gunzip&keys=format,clubs";
import belgium from "@boleiro/data/pack/world/be.pack.json.gz?gunzip&keys=format,clubs";
import bulgaria from "@boleiro/data/pack/world/bg.pack.json.gz?gunzip&keys=format,clubs";
import cyprus from "@boleiro/data/pack/world/cy.pack.json.gz?gunzip&keys=format,clubs";
import czechia from "@boleiro/data/pack/world/cz.pack.json.gz?gunzip&keys=format,clubs";
import germany from "@boleiro/data/pack/world/de.pack.json.gz?gunzip&keys=format,clubs";
import spain from "@boleiro/data/pack/world/es.pack.json.gz?gunzip&keys=format,clubs";
import france from "@boleiro/data/pack/world/fr.pack.json.gz?gunzip&keys=format,clubs";
import england from "@boleiro/data/pack/world/gb-eng.pack.json.gz?gunzip&keys=format,clubs";
import scotland from "@boleiro/data/pack/world/gb-sct.pack.json.gz?gunzip&keys=format,clubs";
import greece from "@boleiro/data/pack/world/gr.pack.json.gz?gunzip&keys=format,clubs";
import croatia from "@boleiro/data/pack/world/hr.pack.json.gz?gunzip&keys=format,clubs";
import hungary from "@boleiro/data/pack/world/hu.pack.json.gz?gunzip&keys=format,clubs";
import israel from "@boleiro/data/pack/world/il.pack.json.gz?gunzip&keys=format,clubs";
import italy from "@boleiro/data/pack/world/it.pack.json.gz?gunzip&keys=format,clubs";
import netherlands from "@boleiro/data/pack/world/nl.pack.json.gz?gunzip&keys=format,clubs";
import norway from "@boleiro/data/pack/world/no.pack.json.gz?gunzip&keys=format,clubs";
import poland from "@boleiro/data/pack/world/pl.pack.json.gz?gunzip&keys=format,clubs";
import portugal from "@boleiro/data/pack/world/pt.pack.json.gz?gunzip&keys=format,clubs";
import slovenia from "@boleiro/data/pack/world/si.pack.json.gz?gunzip&keys=format,clubs";
import slovakia from "@boleiro/data/pack/world/sk.pack.json.gz?gunzip&keys=format,clubs";
import turkey from "@boleiro/data/pack/world/tr.pack.json.gz?gunzip&keys=format,clubs";
import ukraine from "@boleiro/data/pack/world/ua.pack.json.gz?gunzip&keys=format,clubs";
import { imageFileOf, parseAssetManifest } from "@boleiro/data/assetManifest";
import type { Club } from "@boleiro/data/clubs";
import { parsePackClubs } from "@boleiro/data/dataPack";
import { parseWorldPackClubs } from "@boleiro/data/worldPack";

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

// South America's and Europe's clubs, which the game plays result-only, South America's meeting Brazil's in CONMEBOL's cups: their
// names, colours and crests, kept in 64 and 128 px only (pipeline/build_assets.py).
const WORLD_ASSETS = parseAssetManifest(worldManifestJson);
const WORLD_CREST_FILES = import.meta.glob<string>("./crest/*.webp", {
  base: "../../../../packages/data/pack/world/assets/",
  eager: true,
  query: "?url",
  import: "default",
});

/** What a screen shows of a club: its name, colours, ground and, through its id, its crest. */
export type ClubFace = Pick<Club, "id" | "shortName" | "colours" | "stadium">;

const WORLD_PACKS = [argentina, bolivia, chile, colombia, ecuador, peru, paraguay, uruguay, venezuela, armenia, austria, azerbaijan, belgium, bulgaria, cyprus, czechia, germany, spain, france, england, scotland, greece, croatia, hungary, israel, italy, netherlands, norway, poland, portugal, slovenia, slovakia, turkey, ukraine];

const WORLD_BY_ID = new Map<string, ClubFace>(
  WORLD_PACKS
    .flatMap((text) => parseWorldPackClubs(text))
    .map(({ id, shortName, colours, stadium }) => [id, { id, shortName, colours, stadium }]),
);

/** South America's and Europe's clubs by id, for screens that list clubs the game's own `clubs` don't have. */
export const WORLD_FACES: Readonly<Record<string, ClubFace>> = Object.fromEntries(WORLD_BY_ID);

const LEAGUE_LEVEL = /^(.+)-(\d+)$/;

/**
 * South America's and Europe's league clubs as a coach can take them (the full tier then plays their
 * country): each with its country and level, the pack's league `gb-eng-1` being England's top.
 */
export const CLUBS_ABROAD: readonly Club[] = WORLD_PACKS.flatMap((text) => parseWorldPackClubs(text)).flatMap(({ id, name, shortName, colours, stadium, league }) => {
  const [, country, level] = LEAGUE_LEVEL.exec(league ?? "") ?? [];
  if (!country || !level) return [];
  const sources = { names: "transfermarkt", state: "", division: "", stadium: "transfermarkt", pitch: "", colours: "transfermarkt", fanbase: "" };
  return [{ id, transfermarktId: id.replace(/^tm-/, ""), name, shortName, division: null, stadium, capacity: 0, pitch: "natural" as const, colours, fanbase: 0, abroad: { country, level: Number(level) - 1 }, sources }];
});

const ABROAD_BY_ID = new Map(CLUBS_ABROAD.map((club) => [club.id, club]));

/** A club of Brazil's pack, or one abroad a coach can take; null when neither has it. */
export function clubById(id: string): Club | null {
  return BY_ID.get(id) ?? ABROAD_BY_ID.get(id) ?? null;
}

/** A club in the game's own `clubs`, or one of South America's or Europe's from the packs; null when neither has it. */
export function clubFaceOf(clubs: Readonly<Record<string, ClubFace>>, id: string): ClubFace | null {
  return clubs[id] ?? WORLD_BY_ID.get(id) ?? null;
}

/** The club's crest in the smallest variant at least `size` device pixels tall or wide (or the largest it has), or null when it has none. */
export function crestUrlOf(clubId: string, size = 64): string | null {
  const file = imageFileOf(ASSETS, clubId, "crest", size, "webp");
  if (file) return CREST_FILES[`./${file}`] ?? null;
  const worldFile = imageFileOf(WORLD_ASSETS, clubId, "crest", size, "webp");
  return worldFile ? (WORLD_CREST_FILES[`./${worldFile}`] ?? null) : null;
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

/** The WCAG contrast ratio between two colours, from 1 to 21. */
export function contrast(a: string, b: string): number {
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
