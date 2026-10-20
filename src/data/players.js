import { readDataFile } from "./readDataFile.js";
import { parseCsv } from "./csv.js";
const GROUPS = ["GK", "DEF", "MID", "ATT"];
const DIVISIONS = ["A", "B", "C", "D"];
function isGroup(value) {
    return GROUPS.includes(value);
}
function toDivision(value) {
    return DIVISIONS.find((division) => division === value) ?? null;
}
function invalid(line, field, value) {
    throw new Error(`players.csv line ${line}: invalid ${field} "${value ?? ""}"`);
}
/** Squad players from players.csv text; a row with a bad club, group, strength or age throws. */
export function parsePlayers(csv) {
    return parseCsv(csv).map((row, i) => {
        const line = i + 2;
        if (!row.club_id)
            invalid(line, "club_id", row.club_id);
        if (!row.group || !isGroup(row.group))
            invalid(line, "group", row.group);
        const strength = Number(row.strength);
        if (!row.strength || !Number.isFinite(strength) || strength < 1 || strength > 99)
            invalid(line, "strength", row.strength);
        const age = row.age ? Number(row.age) : null;
        if (age !== null && !Number.isInteger(age))
            invalid(line, "age", row.age);
        return {
            clubId: row.club_id,
            club: row.club ?? "",
            division: toDivision(row.division),
            name: row.name ?? "",
            group: row.group,
            strength,
            age,
            nationalities: (row.nationality ?? "").split("/").filter(Boolean),
        };
    });
}
export function loadPlayers() {
    return parsePlayers(readDataFile("players.csv"));
}
export function loadTeams(division) {
    const teams = new Map();
    for (const { clubId, club, division: playerDivision, name, group, strength } of loadPlayers()) {
        if (playerDivision !== division)
            continue;
        const team = teams.get(clubId) ?? { name: club, players: [] };
        team.players.push({ name, group, strength });
        teams.set(clubId, team);
    }
    return [...teams.values()];
}
