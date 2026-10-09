import { readFileSync } from "node:fs";
import type { Player, PositionGroup, Team } from "../engine/match.js";
import { parseCsv } from "./csv.js";

export type Division = "A" | "B" | "C" | "D";

export type SquadPlayer = Player & {
  clubId: string;
  club: string;
  division: Division | null;
  /** null when Transfermarkt has no birth date. */
  age: number | null;
  nationalities: string[];
};

const PLAYERS_CSV = new URL("../../data/players.csv", import.meta.url);
const GROUPS: readonly PositionGroup[] = ["GK", "DEF", "MID", "ATT"];
const DIVISIONS: readonly Division[] = ["A", "B", "C", "D"];

function isGroup(value: string): value is PositionGroup {
  return (GROUPS as readonly string[]).includes(value);
}

function toDivision(value: string | undefined): Division | null {
  return DIVISIONS.find((division) => division === value) ?? null;
}

function invalid(line: number, field: string, value: string | undefined): never {
  throw new Error(`players.csv line ${line}: invalid ${field} "${value ?? ""}"`);
}

/** Squad players from players.csv text; a row with a bad club, group, strength or age throws. */
export function parsePlayers(csv: string): SquadPlayer[] {
  return parseCsv(csv).map((row, i) => {
    const line = i + 2;
    if (!row.club_id) invalid(line, "club_id", row.club_id);
    if (!row.group || !isGroup(row.group)) invalid(line, "group", row.group);
    const strength = Number(row.strength);
    if (!row.strength || !Number.isFinite(strength) || strength < 1 || strength > 99) invalid(line, "strength", row.strength);
    const age = row.age ? Number(row.age) : null;
    if (age !== null && !Number.isInteger(age)) invalid(line, "age", row.age);
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

export function loadPlayers(): SquadPlayer[] {
  return parsePlayers(readFileSync(PLAYERS_CSV, "utf8"));
}

export function loadTeams(division: Division): Team[] {
  const teams = new Map<string, Team>();
  for (const { clubId, club, division: playerDivision, name, group, strength } of loadPlayers()) {
    if (playerDivision !== division) continue;
    const team = teams.get(clubId) ?? { name: club, players: [] };
    team.players.push({ name, group, strength });
    teams.set(clubId, team);
  }
  return [...teams.values()];
}
