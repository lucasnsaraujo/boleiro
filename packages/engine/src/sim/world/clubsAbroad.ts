import type { Club } from "@boleiro/data/clubs";
import type { PositionGroup, SquadPlayer } from "@boleiro/data/players";
import { elevenAverage } from "../continental/continentalField.js";
import type { CountryStart } from "../newGame.js";

const GROUP_OF: Record<string, PositionGroup> = { G: "GK", D: "DEF", M: "MID", A: "ATT" };

// guess: the packs give no crowds or stadiums abroad; a level's strongest squad draws like a big
// Série A club and its weakest like a small one, the levels below on about half of that.
const FANBASE = { top: 8_000_000, bottom: 400_000 };
const CAPACITY = { top: 60_000, bottom: 18_000 };
const LOWER_LEVEL_SHARE = 0.4;

const between = ([top, bottom]: [number, number], position: number) => Math.round(top + (bottom - top) * position);

/**
 * A result-only country's clubs and squads as the full tier keeps them, when a human coach takes one
 * of its clubs: each club with its level, a crowd and stadium by its squad's rank in the level, and
 * its players as the data gives them (no ages or nationalities: the world packs keep neither).
 */
export function clubsAbroad({ structure, levels }: CountryStart): { clubs: Club[]; players: SquadPlayer[] } {
  const clubs: Club[] = [];
  const players: SquadPlayer[] = [];
  levels.forEach((members, level) => {
    const share = level === 0 ? 1 : LOWER_LEVEL_SHARE;
    const ranked = [...members].sort((a, b) => elevenAverage(b) - elevenAverage(a) || a.id.localeCompare(b.id));
    ranked.forEach((club, rank) => {
      const position = ranked.length > 1 ? rank / (ranked.length - 1) : 0;
      clubs.push({
        id: club.id,
        transfermarktId: club.id.replace(/^tm-/, ""),
        name: club.name,
        shortName: club.name,
        division: null,
        stadium: "",
        capacity: between([CAPACITY.top * share, CAPACITY.bottom * share], position),
        pitch: "natural",
        colours: club.colours ?? { primary: "#3C4A40", secondary: "#FFFFFF" },
        fanbase: between([FANBASE.top * share, FANBASE.bottom * share], position),
        abroad: { country: structure.id, level },
        sources: { names: "transfermarkt", state: "", division: "", stadium: "", pitch: "guess", colours: "transfermarkt", fanbase: "guess" },
      });
      club.strengths.forEach((strength, i) => {
        const group = GROUP_OF[club.positions[i] ?? ""];
        if (!group) throw new Error(`club ${club.id}: player ${i} has no position`);
        players.push({ name: club.names?.[i] ?? `${club.name} ${i + 1}`, group, strength, clubId: club.id, club: club.name, division: null, age: null, nationalities: [] });
      });
    });
  });
  return { clubs, players };
}
