import type { WorldPack, WorldPackClub, WorldPackPlayer } from "@boleiro/data/worldPack";
import { randomStream } from "../../engine/random.js";
import type { CountryStart } from "../newGame.js";
import { academyPlayer, groupsToFill } from "../players/developPlayers.js";
import { strengthFromValue } from "./strengthYardstick.js";
import type { CountryStructure, WorldClub } from "./world.js";

const LETTER = { GK: "G", DEF: "D", MID: "M", ATT: "A" } as const;

/** The club's squad rated by the yardstick; a player with no market value gets the club's lowest one. */
function worldClubOf({ id, shortName, colours }: WorldPackClub, squad: readonly WorldPackPlayer[], season: number, random: () => number): WorldClub {
  const listed = squad.flatMap((p) => (p.marketValueEur ? [p.marketValueEur] : []));
  const lowest = listed.length ? Math.min(...listed) : 0;
  const rated = squad.map((p) => ({ group: p.group, name: p.name, strength: strengthFromValue(p.marketValueEur ?? lowest) }));
  // Transfermarkt lists a few clubs short or empty; their academy fills them, as at Brazil's clubs.
  const academy = groupsToFill(rated, []).map((group, i) => academyPlayer(`${id}-a${i}`, id, null, group, `${season}-01-01`, random));
  const players = [...rated, ...academy.map((p) => ({ group: p.group, name: p.name, strength: Math.round(p.strength) }))];
  return {
    id,
    name: shortName,
    colours,
    positions: players.map((p) => LETTER[p.group]).join(""),
    strengths: players.map((p) => p.strength),
    names: players.map((p) => p.name),
  };
}

// The academy fill-ins draw from a stream of their own, the same in every game started that season.
const ACADEMY_STREAM_SALT = 0x5a0;

/** The countries of `structures` with their packs' clubs and squads, level by level. */
export function countriesStart(structures: readonly CountryStructure[], packs: readonly WorldPack[], season: number): CountryStart[] {
  return structures.map((structure) => {
    const pack = packs.find((p) => p.country.id === structure.id);
    if (!pack) throw new Error(`no world pack for ${structure.id}`);
    if (pack.leagues.length < structure.levels.length) throw new Error(`${structure.id}: the pack has ${pack.leagues.length} leagues`);
    const random = randomStream((season ^ ACADEMY_STREAM_SALT) >>> 0).next;
    const levels = structure.levels.map((_, level) => worldClubsOf(pack, pack.clubs.filter((club) => club.league === pack.leagues[level]?.id), season, random));
    return { structure, levels };
  });
}

/** The pack's `clubs` with their squads, a club's academy filling it from `random` (its own stream for the season unless given). */
export function worldClubsOf(pack: WorldPack, clubs: readonly WorldPackClub[], season: number, random = randomStream((season ^ ACADEMY_STREAM_SALT) >>> 0).next): WorldClub[] {
  return clubs.map((club) => worldClubOf(club, pack.players.filter((p) => p.clubId === club.id), season, random));
}
