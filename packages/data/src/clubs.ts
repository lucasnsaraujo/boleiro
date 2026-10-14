import { readDataFile } from "./readDataFile.js";
import { parseCsv } from "./csv.js";
import type { Division } from "./players.js";

export const STATES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;
const DIVISIONS = ["A", "B", "C", "D"] as const satisfies readonly Division[];
export const PITCHES = ["natural", "artificial"] as const;

export type State = (typeof STATES)[number];
export type Pitch = (typeof PITCHES)[number];

export type Club = {
  id: string;
  transfermarktId: string;
  name: string;
  shortName: string;
  state: State;
  division: Division | null;
  stadium: string;
  capacity: number;
  pitch: Pitch;
  colours: { primary: string; secondary: string };
  fanbase: number;
  sources: {
    names: string;
    state: string;
    division: string;
    stadium: string;
    pitch: string;
    colours: string;
    fanbase: string;
  };
};

function oneOf<T extends string>(options: readonly T[], value: string | undefined, field: string, id: string): T {
  const match = options.find((option) => option === value);
  if (match === undefined) throw new Error(`club ${id}: invalid ${field} "${value ?? ""}"`);
  return match;
}

function count(value: string | undefined, field: string, id: string): number {
  const parsed = Number(value);
  if (!value || !Number.isInteger(parsed) || parsed < 0) throw new Error(`club ${id}: invalid ${field} "${value ?? ""}"`);
  return parsed;
}

function toClub(row: Record<string, string>): Club {
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

export function parseClubs(csv: string): Club[] {
  return parseCsv(csv).map(toClub);
}

export function loadClubs(): Club[] {
  return parseClubs(readDataFile("clubs.csv"));
}
