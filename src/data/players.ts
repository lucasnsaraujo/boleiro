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

export function loadPlayers(): SquadPlayer[] {
  return parseCsv(readFileSync(PLAYERS_CSV, "utf8")).flatMap((row) =>
    row.club_id && row.group && isGroup(row.group)
      ? [{
          clubId: row.club_id,
          club: row.club ?? "",
          division: toDivision(row.division),
          name: row.name ?? "",
          group: row.group,
          strength: Number(row.strength),
          age: row.age ? Number(row.age) : null,
          nationalities: (row.nationality ?? "").split("/").filter(Boolean),
        }]
      : [],
  );
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
