import clubsCsv from "../../../../data/clubs.csv?raw";
import crestsCsv from "../../../../data/crests.csv?raw";
import { parseClubs, type Club } from "@boleiro/data/clubs";
import { crestOf, parseCrests } from "@boleiro/data/crests";

/** Every club as `data/clubs.csv` has it, for screens that only need names, colours and crests. */
export const CLUBS: readonly Club[] = parseClubs(clubsCsv);

const BY_ID = new Map(CLUBS.map((club) => [club.id, club]));
const CRESTS = parseCrests(crestsCsv);
// Keys are relative to this file, so a crest path from data/crests.csv maps to `../../../../<path>`.
const CREST_FILES = import.meta.glob<string>("../../../../assets/crests/*.png", { eager: true, query: "?url", import: "default" });

export function clubById(id: string): Club | null {
  return BY_ID.get(id) ?? null;
}

export function crestUrlOf(clubId: string): string | null {
  const crest = crestOf(CRESTS, clubId);
  return crest ? (CREST_FILES[`../../../../${crest.crest}`] ?? null) : null;
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

/** Club-colour plate, the way Brasfoot paints names: the second colour on the first when it reads, else white or black. */
export function plateColours({ primary, secondary }: Club["colours"]): { background: string; text: string } {
  if (contrast(primary, secondary) >= READABLE) return { background: primary, text: secondary };
  return { background: primary, text: contrast(primary, "#ffffff") >= contrast(primary, "#0a0a0a") ? "#ffffff" : "#0a0a0a" };
}
