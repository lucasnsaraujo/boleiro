import { readFileSync } from "node:fs";
import type { PositionGroup, Team } from "../engine/match.js";
import { parseCsv } from "./csv.js";

export type Division = "A" | "B" | "C" | "D";

const PLAYERS_CSV = new URL("../../data/players.csv", import.meta.url);
const GROUPS: readonly PositionGroup[] = ["GK", "DEF", "MID", "ATT"];

function isGroup(value: string): value is PositionGroup {
  return (GROUPS as readonly string[]).includes(value);
}

export function loadTeams(division: Division): Team[] {
  const teams = new Map<string, Team>();
  for (const row of parseCsv(readFileSync(PLAYERS_CSV, "utf8"))) {
    if (row.division !== division || !row.club || !row.group || !isGroup(row.group)) continue;
    const team = teams.get(row.club) ?? { name: row.club, players: [] };
    team.players.push({ name: row.name ?? "", group: row.group, strength: Number(row.strength) });
    teams.set(row.club, team);
  }
  return [...teams.values()];
}
