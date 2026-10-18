import { GROUP_OF_ROLE, type PositionGroup, type Role } from "@boleiro/data/players";
import { pickLineup, type Player, type Team } from "../../engine/match.js";
import type { IsoDate, SimPlayer } from "../gameState.js";
import { isInjured } from "../players/isInjured.js";
import type { Nations, NationalTeam, Outsiders } from "./nations.js";
import { compareText } from "../compareText.js";

/** The places of a call-up by position, 26 in all: 3 goalkeepers, 4 full-backs, 4 centre-backs, 7 midfielders, 8 forwards (the mock's, after Brazil's lists). */
export const CALL_UP_PLACES: Record<Role, number> = { goleiro: 3, lateral: 4, zagueiro: 4, meia: 7, atacante: 8 };
export const CALL_UP_SIZE = Object.values(CALL_UP_PLACES).reduce((sum, places) => sum + places, 0);
const ROLE_OF_LETTER: Record<string, Role> = { g: "goleiro", l: "lateral", z: "zagueiro", m: "meia", a: "atacante" };
const ROLE_OF_GROUP: Record<PositionGroup, Role> = { GK: "goleiro", DEF: "zagueiro", MID: "meia", ATT: "atacante" };
// guess: a player the pack lists abroad leaves a national pool after his 36th birthday year.
const OLDEST = 36;
/** An outsider's pick, as a call-up keeps it among player ids: "~" and his row in the team's Outsiders. */
export const OUTSIDER_MARK = "~";

// Transfermarkt's citizenship names that don't slug to a national team's id.
const NATIONALITY_ALIASES: Record<string, string> = {
  "czech-republic": "czechia",
  "cote-d-ivoire": "ivory-coast",
  ireland: "republic-of-ireland",
  "dr-congo": "democratic-republic-of-the-congo",
  "korea-south": "south-korea",
  turkey: "turkiye",
  usa: "united-states",
  "bosnia-and-herzegovina": "bosnia-herzegovina",
};

export function slug(name: string): string {
  return name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** The national team a citizenship plays for, if the game has it. */
export function teamOfNationality(nationality: string, teams: Readonly<Record<string, unknown>>): string | null {
  const own = slug(nationality);
  const id = NATIONALITY_ALIASES[own] ?? own;
  return id in teams ? id : null;
}

/** A player's position for a call-up: his main one, else his group's. */
export const roleOf = (player: Pick<SimPlayer, "positions" | "group">): Role => player.positions?.[0] ?? ROLE_OF_GROUP[player.group];

/** The game's players by the national team of their first citizenship, at a club. */
export function nationalsByTeam(players: Readonly<Record<string, SimPlayer>>, teams: Readonly<Record<string, NationalTeam>>): Map<string, SimPlayer[]> {
  const byTeam = new Map<string, SimPlayer[]>();
  const known = new Map<string, string | null>();
  for (const id in players) {
    const player = players[id];
    const nationality = player?.nationalities[0];
    if (!player || !nationality) continue;
    let team = known.get(nationality);
    if (team === undefined) known.set(nationality, (team = teamOfNationality(nationality, teams)));
    if (!team) continue;
    const own = byTeam.get(team);
    if (own) own.push(player);
    else byTeam.set(team, [player]);
  }
  return byTeam;
}

/** A pick for a call-up: the game's player or an outsider's row, his position and strength. */
type Candidate = { ref: string; role: Role; strength: number };

/** The outsiders of a pool still young enough on `date`, as candidates. */
function outsiderCandidates(outsiders: Outsiders | undefined, date: IsoDate): Candidate[] {
  if (!outsiders) return [];
  const year = Number(date.slice(0, 4));
  return outsiders.names.flatMap((_, row) => {
    const born = outsiders.born[row] ?? 0;
    if (born && year - born > OLDEST) return [];
    return [{ ref: `${OUTSIDER_MARK}${row}`, role: ROLE_OF_LETTER[outsiders.roles[row] ?? "m"] ?? "meia", strength: outsiders.strengths[row] ?? 0 }];
  });
}

/**
 * The best 26 of `candidates` by position places, the leftover places going to the best outfield players left;
 * those at least as strong as `bar` first, the rest only for places they would leave empty.
 */
function bestByPlaces(candidates: readonly Candidate[], bar: number): string[] {
  const sorted = [...candidates].sort((a, b) => Number(b.strength >= bar) - Number(a.strength >= bar) || b.strength - a.strength || compareText(a.ref, b.ref));
  const taken = new Set<string>();
  for (const [role, places] of Object.entries(CALL_UP_PLACES)) {
    for (const candidate of sorted.filter((c) => c.role === role).slice(0, places)) taken.add(candidate.ref);
  }
  for (const candidate of sorted) {
    if (taken.size >= CALL_UP_SIZE) break;
    if (candidate.role !== "goleiro") taken.add(candidate.ref);
  }
  return sorted.filter((c) => taken.has(c.ref)).map((c) => c.ref);
}

/**
 * The call-up a national coach makes on `date`: the best fit players of his pool by position, the game's and the
 * outsiders, as refs (player ids, or OUTSIDER_MARK rows). The outsiders are the team's last real call-up, so a
 * player of the game's own weaker than the weakest of them makes it only to a place no one stronger fills
 * (guess: a national coach looks at the whole country's players, which the pack lists only as far as he last
 * called them).
 */
export function pickCallUp(nationals: readonly SimPlayer[], outsiders: Outsiders | undefined, date: IsoDate): string[] {
  const others = outsiderCandidates(outsiders, date);
  const bar = others.length ? Math.min(...others.map((c) => c.strength)) : 0;
  const own = nationals.filter((p) => !isInjured(p, date)).map((p): Candidate => ({ ref: p.id, role: roleOf(p), strength: p.strength }));
  return bestByPlaces([...own, ...others], bar);
}

/** Splits call-up refs into the game's player ids and outsider rows. */
export function splitRefs(refs: readonly string[]): { playerIds: string[]; outsiders: number[] } {
  const playerIds: string[] = [];
  const outsiders: number[] = [];
  for (const ref of refs) {
    if (ref.startsWith(OUTSIDER_MARK)) outsiders.push(Number(ref.slice(OUTSIDER_MARK.length)));
    else playerIds.push(ref);
  }
  return { playerIds, outsiders };
}

/** A team's called-up players as the match engine fields them on `date`: its best fit eleven. */
export function nationalSide(nations: Nations, teamId: string, players: Readonly<Record<string, SimPlayer>>, date: IsoDate): { team: Team; fielded: SimPlayer[] } {
  const callUp = nations.callUps[teamId];
  const outsiders = nations.outsiders[teamId];
  const own = (callUp?.playerIds ?? []).flatMap((id) => (players[id] && !isInjured(players[id], date) ? [players[id]] : []));
  const others: Player[] = (callUp?.outsiders ?? []).flatMap((row) => {
    const name = outsiders?.names[row];
    if (name === undefined) return [];
    return [{ name, group: GROUP_OF_ROLE[ROLE_OF_LETTER[outsiders?.roles[row] ?? "m"] ?? "meia"], strength: outsiders?.strengths[row] ?? 0 }];
  });
  const lineup = pickLineup<Player>([...own, ...others]);
  const fielded = own.filter((p) => lineup.includes(p));
  return { team: { name: nations.teams[teamId]?.name ?? teamId, players: lineup }, fielded };
}
