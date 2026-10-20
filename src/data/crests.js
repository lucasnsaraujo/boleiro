import { readDataFile } from "./readDataFile.js";
import { parseCsv } from "./csv.js";
export function parseCrests(csv) {
    return new Map(parseCsv(csv)
        .filter((row) => row.crest)
        .map((row) => [row.club_id ?? "", { crest: row.crest ?? "", scoreboardCrest: row.scoreboard_crest || null }]));
}
export function loadCrests() {
    return parseCrests(readDataFile("crests.csv"));
}
/** The club's crest paths, or null when it has none; the UI then falls back to colours and initials. */
export function crestOf(crests, clubId) {
    return crests.get(clubId) ?? null;
}
