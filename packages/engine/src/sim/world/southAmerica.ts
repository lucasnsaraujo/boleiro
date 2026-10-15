import type { WorldPack, WorldPackPlayer } from "@boleiro/data/worldPack";
import { randomStream } from "../../engine/random.js";
import type { CountryStart } from "../newGame.js";
import { academyPlayer, groupsToFill } from "../players/developPlayers.js";
import type { LeaguePlace } from "./continentalPlaces.js";
import { strengthFromValue } from "./strengthYardstick.js";
import type { CountryStructure, WorldClub } from "./world.js";

/** Where a club enters CONMEBOL's cups, as the 2026 regulations allot each country's places. */
export const CONTINENTAL_ENTRIES = ["libertadoresGroups", "libertadoresStage2", "libertadoresStage1", "sulAmericanaGroups", "sulAmericanaStage1"] as const;
export type ContinentalEntry = (typeof CONTINENTAL_ENTRIES)[number];

type Places = LeaguePlace<ContinentalEntry>[];

const places = (...counts: [ContinentalEntry, number][]): Places => counts.map(([entry, count]) => ({ entry, from: "league", places: count }));

// CONMEBOL's 2026 allotment: Argentina five Libertadores group places, one in its second stage and
// six Sul-Americana group places; Chile and Colombia two group places and two in the second stage;
// Bolivia, Ecuador, Paraguay, Peru, Uruguay and Venezuela two group places, one in the second stage
// and one in the first; each of those eight sends four clubs to the Sul-Americana's first stage.
const ARGENTINA_PLACES = places(["libertadoresGroups", 5], ["libertadoresStage2", 1], ["sulAmericanaGroups", 6]);
const TWO_SECOND_STAGE_PLACES = places(["libertadoresGroups", 2], ["libertadoresStage2", 2], ["sulAmericanaStage1", 4]);
const FIRST_STAGE_PLACE = places(["libertadoresGroups", 2], ["libertadoresStage2", 1], ["libertadoresStage1", 1], ["sulAmericanaStage1", 4]);

// Result-only leagues play a straight round robin (SPEC §6), over a guessed window of the calendar
// year, each league's real one being split in Apertura and Clausura. Leagues of up to 20 clubs meet
// twice, Argentina's 30 and 36 once. Argentina relegates two clubs and promotes two.
const window: [string, string] = ["02-01", "11-29"];
const single = (name: string) => [{ name, legs: 2 as const, promoted: 0, relegated: 0 }];

export const SOUTH_AMERICA: readonly CountryStructure[] = [
  {
    id: "ar",
    levels: [
      { name: "Liga Profesional", legs: 1, promoted: 0, relegated: 2 },
      { name: "Primera Nacional", legs: 1, promoted: 2, relegated: 0 },
    ],
    window: ["01-24", "12-06"],
    continental: ARGENTINA_PLACES,
  },
  { id: "bo", levels: single("División Profesional"), window, continental: FIRST_STAGE_PLACE },
  { id: "cl", levels: single("Liga de Primera"), window, continental: TWO_SECOND_STAGE_PLACES },
  { id: "co", levels: single("Liga Dimayor"), window: ["01-17", "12-06"], continental: TWO_SECOND_STAGE_PLACES },
  { id: "ec", levels: single("LigaPro Serie A"), window, continental: FIRST_STAGE_PLACE },
  { id: "pe", levels: single("Liga 1"), window, continental: FIRST_STAGE_PLACE },
  { id: "py", levels: single("Primera División"), window, continental: FIRST_STAGE_PLACE },
  { id: "uy", levels: single("Liga AUF"), window, continental: FIRST_STAGE_PLACE },
  { id: "ve", levels: single("Liga FUTVE"), window, continental: FIRST_STAGE_PLACE },
];

const LETTER = { GK: "G", DEF: "D", MID: "M", ATT: "A" } as const;

/** The club's squad rated by the yardstick; a player with no market value gets the club's lowest one. */
function worldClubOf(id: string, name: string, squad: readonly WorldPackPlayer[], season: number, random: () => number): WorldClub {
  const listed = squad.flatMap((p) => (p.marketValueEur ? [p.marketValueEur] : []));
  const lowest = listed.length ? Math.min(...listed) : 0;
  const rated = squad.map((p) => ({ group: p.group, name: p.name, strength: strengthFromValue(p.marketValueEur ?? lowest) }));
  // Transfermarkt lists a few clubs short or empty; their academy fills them, as at Brazil's clubs.
  const academy = groupsToFill(rated, []).map((group, i) => academyPlayer(`${id}-a${i}`, id, null, group, `${season}-01-01`, random));
  const players = [...rated, ...academy.map((p) => ({ group: p.group, name: p.name, strength: Math.round(p.strength) }))];
  return {
    id,
    name,
    positions: players.map((p) => LETTER[p.group]).join(""),
    strengths: players.map((p) => p.strength),
    names: players.map((p) => p.name),
  };
}

/** The South American countries of `SOUTH_AMERICA` with their packs' clubs and squads, level by level. */
export function southAmericaStart(packs: readonly WorldPack[], season: number, seed: number): CountryStart[] {
  return SOUTH_AMERICA.map((structure) => {
    const pack = packs.find((p) => p.country.id === structure.id);
    if (!pack) throw new Error(`no world pack for ${structure.id}`);
    if (pack.leagues.length < structure.levels.length) throw new Error(`${structure.id}: the pack has ${pack.leagues.length} leagues`);
    const random = randomStream(seed).next;
    const levels = structure.levels.map((_, level) =>
      pack.clubs
        .filter((club) => club.league === pack.leagues[level]?.id)
        .map((club) => worldClubOf(club.id, club.shortName, pack.players.filter((p) => p.clubId === club.id), season, random)),
    );
    return { structure, levels };
  });
}
