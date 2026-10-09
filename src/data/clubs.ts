import { readFileSync } from "node:fs";
import { parseCsv } from "./csv.js";
import type { Division } from "./players.js";

const STATES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;
const DIVISIONS = ["A", "B", "C", "D"] as const satisfies readonly Division[];
const PITCHES = ["natural", "artificial"] as const;

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
  crestUrl: string | null;
  fanbase: number;
  sources: {
    names: string;
    state: string;
    division: string;
    stadium: string;
    pitch: string;
    colours: string;
    crest: string;
    fanbase: string;
  };
};

const CLUBS_CSV = new URL("../../data/clubs.csv", import.meta.url);

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
    crestUrl: row.crest_url || null,
    fanbase: count(row.fanbase, "fanbase", id),
    sources: {
      names: row.names_source ?? "",
      state: row.state_source ?? "",
      division: row.division_source ?? "",
      stadium: row.stadium_source ?? "",
      pitch: row.pitch_source ?? "",
      colours: row.colours_source ?? "",
      crest: row.crest_source ?? "",
      fanbase: row.fanbase_source ?? "",
    },
  };
}

export function loadClubs(): Club[] {
  return parseCsv(readFileSync(CLUBS_CSV, "utf8")).map(toClub);
}
