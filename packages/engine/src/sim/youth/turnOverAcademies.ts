import type { PositionGroup } from "../../engine/match.js";
import { randomStream } from "../../engine/random.js";
import { clubStatures } from "../coach/clubStatures.js";
import type { GameState, SimPlayer } from "../gameState.js";
import { isWorthPromoting, normal, professionalOf, type YouthPromoted } from "../players/developPlayers.js";
import { squadsByClub } from "../players/squadsByClub.js";
import { academyClubs, academyOf, clampStrength, gapAt, inventProspect, LEAVING_AGE, openAcademies, thinnestGroup, YOUTH_AGES, type Prospect } from "./academy.js";
import { firstWage, type ProspectReleased } from "./moveProspect.js";

export type YouthTrialsHeld = { type: "youthTrialsHeld"; clubId: string; prospectIds: string[] };
export type YouthEvent = YouthPromoted | ProspectReleased | YouthTrialsHeld;

// guess: the end-of-season trials ("peneira") bring two to four kids into each academy.
const TRIALS = { min: 2, max: 4 };
// guess: a kid's year can go a point and a half better or worse than his age's usual growth.
const GROWTH_SD = 1.5;

/** The kid a year older, grown by about what his age usually brings. */
function aged(prospect: Prospect, random: () => number): Prospect {
  const growth = gapAt(prospect.age) - gapAt(prospect.age + 1) + GROWTH_SD * normal(random);
  return { ...prospect, age: prospect.age + 1, strength: clampStrength(Math.min(prospect.potential, prospect.strength + growth)) };
}

/**
 * The academies at the season's turn, on the first day of the new year before the squads turn over:
 * each kid about to turn 21 is promoted if his club would keep him (he ages with the squad) and
 * released otherwise, every other kid ages a year and grows (at the coach's club the assistant decides the ones the coach left); then the
 * trials bring new 16-year-olds. A save from before academies opens them here instead.
 */
export function turnOverAcademies(state: GameState): { state: GameState; events: YouthEvent[] } {
  const season = state.season + 1;
  if (!state.youth) return { state: { ...state, youth: openAcademies({ ...state, season }) }, events: [] };
  const random = randomStream(state.youth.rngState);
  const events: YouthEvent[] = [];
  const squads = squadsByClub(state.players);
  const promoted: Record<string, SimPlayer> = {};
  const staying: Record<string, Prospect> = {};
  for (const prospect of Object.values(state.youth.prospects)) {
    if (prospect.age + 1 < LEAVING_AGE) {
      const older = aged(prospect, random.next);
      staying[older.id] = older;
      continue;
    }
    // He joins the squad as he is; the squads' own turnover (developPlayers) ages and develops him with everyone.
    const squad = squads.get(prospect.clubId) ?? [];
    if (isWorthPromoting(state, prospect, squad)) {
      const player = professionalOf(prospect, prospect.clubId, firstWage(prospect, squad), state.date, random.next);
      promoted[player.id] = player;
      squads.set(prospect.clubId, [...squad, player]);
      events.push({ type: "youthPromoted", playerId: prospect.id, clubId: prospect.clubId });
    } else {
      events.push({ type: "prospectReleased", prospectId: prospect.id, clubId: prospect.clubId, name: prospect.name });
    }
  }
  const next: GameState = { ...state, players: { ...state.players, ...promoted } };

  const statures = clubStatures(next);
  const joined = { ...staying };
  const groupsByClub = new Map<string, PositionGroup[]>();
  for (const p of Object.values(staying)) groupsByClub.set(p.clubId, [...(groupsByClub.get(p.clubId) ?? []), p.group]);
  for (const club of academyClubs(next)) {
    const { size, potentialMean } = academyOf(club, statures.get(club.id) ?? 0);
    const groups = groupsByClub.get(club.id) ?? [];
    const count = Math.min(TRIALS.max, Math.max(TRIALS.min, size - groups.length));
    const prospectIds: string[] = [];
    for (let i = 0; i < count; i++) {
      const group = thinnestGroup(groups);
      groups.push(group);
      const id = `k${season}-${club.id}-${i}`;
      joined[id] = inventProspect(id, club, potentialMean, group, YOUTH_AGES.min, season, random.next);
      prospectIds.push(id);
    }
    events.push({ type: "youthTrialsHeld", clubId: club.id, prospectIds });
  }
  return { state: { ...next, youth: { ...state.youth, prospects: joined, rngState: random.state() } }, events };
}
