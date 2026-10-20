import { readDataFile } from "./readDataFile.js";
import { parseCsv } from "./csv.js";
export const STATES = [
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
    "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];
const DIVISIONS = ["A", "B", "C", "D"];
const PITCHES = ["natural", "artificial"];
function oneOf(options, value, field, id) {
    const match = options.find((option) => option === value);
    if (match === undefined)
        throw new Error(`club ${id}: invalid ${field} "${value ?? ""}"`);
    return match;
}
function count(value, field, id) {
    const parsed = Number(value);
    if (!value || !Number.isInteger(parsed) || parsed < 0)
        throw new Error(`club ${id}: invalid ${field} "${value ?? ""}"`);
    return parsed;
}
function toClub(row) {
    const id = row.id ?? "";
    return {
        id,
        transfermarktId: row.tm_id ?? "",
        name: row.name ?? "",
        shortName: row.short_name ?? "",
        state: oneOf(STATES, row.state, "state", id),
        division: row.division ? oneOf(DIVISIONS, row.division, "division", id) : null,
        stadium: row.stadium ?? "",
        capacity: count(row.capacity, "capacity", id),
        pitch: oneOf(PITCHES, row.pitch, "pitch", id),
        colours: { primary: row.primary_colour ?? "", secondary: row.secondary_colour ?? "" },
        fanbase: count(row.fanbase, "fanbase", id),
        sources: {
            names: row.names_source ?? "",
            state: row.state_source ?? "",
            division: row.division_source ?? "",
            stadium: row.stadium_source ?? "",
            pitch: row.pitch_source ?? "",
            colours: row.colours_source ?? "",
            fanbase: row.fanbase_source ?? "",
        },
    };
}
export function parseClubs(csv) {
    return parseCsv(csv).map(toClub);
}
export function loadClubs() {
    return parseClubs(readDataFile("clubs.csv"));
}
