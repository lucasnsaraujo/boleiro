import { readDataFile } from "./readDataFile.js";
import { parseCsv } from "./csv.js";

/** Paths relative to the repo root: the Transfermarkt crest, and ESPN's 500 px logo when a match was certain. */
export type ClubCrest = { crest: string; scoreboardCrest: string | null };

/** `data/crests.csv` keyed by club id. */
export type Crests = ReadonlyMap<string, ClubCrest>;

export function parseCrests(csv: string): Crests {
  return new Map(
    parseCsv(csv)
      .filter((row) => row.crest)
      .map((row) => [row.club_id ?? "", { crest: row.crest ?? "", scoreboardCrest: row.scoreboard_crest || null }]),
  );
}

export function loadCrests(): Crests {
  return parseCrests(readDataFile("crests.csv"));
}

/** The club's crest paths, or null when it has none; the UI then falls back to colours and initials. */
export function crestOf(crests: Crests, clubId: string): ClubCrest | null {
  return crests.get(clubId) ?? null;
}
