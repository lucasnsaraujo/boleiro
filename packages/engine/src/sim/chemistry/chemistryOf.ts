import { arrange, FORMATIONS, type Formation } from "../../engine/formations.js";
import { waitingCoachesOf } from "../coach/humanCoaches.js";
import { addDays, daysBetween } from "../dates.js";
import { eventsOf } from "../events/eventMemory.js";
import type { GameState, SimPlayer } from "../gameState.js";
import { IDOL_APPS, IDOL_GOALS } from "../history/clubHistory.js";
import { clubMood } from "../morale/clubMood.js";
import { isInjured } from "../players/isInjured.js";
import { pickMatchLineup } from "../players/pickMatchLineup.js";
import { formationOf, usualStartersOf } from "../players/usualLineups.js";

/**
 * What a club's chemistry remembers between matches: its last starting eleven, how settled the eleven
 * has been (`settled`, see recordElevens), how many matches in a row it kept most of it, how many
 * starters of the last match also started the one before, the meter before the last match, and the
 * captain the coach named, if he named one.
 */
export type ClubChemistry = { eleven: string[]; settled: number; steadyGames: number; kept: number; was: number; captainId?: string };

/**
 * Why the meter is where it is, each with the points it adds to the neutral 50: a settled or
 * changing eleven, the captain's standing, new signings in the eleven, places fought over, fights,
 * and pairs that get on.
 */
export type ChemistryReason =
  | { kind: "settled"; points: number; steadyGames: number; kept: number }
  | { kind: "captain"; points: number; playerId: string; standing: number }
  | { kind: "newcomers" | "rivals" | "fights" | "pairs"; points: number; playerIds: string[] };

/** A line on the relationship map: a pair that gets on, two players after one place, or two who fought. */
export type ChemistryLink = { kind: "good" | "rival" | "fight"; playerIds: [string, string]; weight: number };

export type CaptainView = { playerId: string; standing: number; isNamed: boolean };

/**
 * A club's chemistry (entrosamento) today: the 0–100 meter, the meter before its last match, why it is
 * there, the eleven the map shows in its formation, its captain and the squad's candidates by standing,
 * and the map's lines.
 */
export type Chemistry = {
  value: number;
  was: number;
  reasons: ChemistryReason[];
  formation: Formation;
  eleven: string[];
  /** Null only for a club without players. */
  captain: CaptainView | null;
  /** Every player of the squad by standing, the most first; the assistant suggests the first. */
  candidates: { playerId: string; standing: number }[];
  links: ChemistryLink[];
};

export const NEUTRAL_CHEMISTRY = 50;
// guess: the spec's bound. A meter of 100 adds 3% to every starter's strength, 0 takes 3% off.
const MAX_STRENGTH_SHARE = 0.03;
// guess: `settled` runs between these, about four matches with the same eleven from neutral to the top.
export const SETTLED_LIMIT = 12;
// guess: a starter is new for his first four months at the club, and costs this many points.
const NEW_FOR_DAYS = 120;
const NEWCOMER_POINTS = -2;
const NEWCOMERS_FLOOR = -8;
// guess: a fit reserve this close to a starter in strength, in the same position, wants his place.
const RIVAL_GAP = 1;
const RIVAL_POINTS = -2;
const RIVALS_FLOOR = -6;
// guess: two players who fought stay a bad pair for three months.
const FIGHT_FOR_DAYS = 90;
const FIGHT_POINTS = -3;
const FIGHTS_FLOOR = -6;
// guess: every two pairs that get on add a point, up to this many.
const PAIRS_CAP = 5;
// guess: a captain at full standing adds this many points, one without any takes as many off.
const CAPTAIN_POINTS = 6;
// guess: neighbours on the map are slots this close (percent of the pitch); each player is linked to his two nearest.
const NEIGHBOUR_DISTANCE = 30;
const NEIGHBOURS = 2;
// guess: a player settles in his first season at the club; a pair's line thickens up to three with their games there.
const SETTLED_AT_CLUB_DAYS = 180;
const LINK_APPS = 50;
const MAX_LINK_WEIGHT = 3;

// Captain standing, out of 100 (guess): seniority, rank in the squad, games at the club, idol status and morale.
const AGE_POINTS = 30;
const AGE_FROM = 21;
const AGE_TO = 32;
const RANK_POINTS = 25;
const APPS_POINTS = 25;
const APPS_FOR_FULL = 100;
const IDOL_POINTS = 10;
const MORALE_POINTS = 10;
// A player out of the team for most of the season has no voice in the dressing room.
const LEFT_OUT_SHARE = 0.25;
const LEFT_OUT_AFTER_MINUTES = 900;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The share of strength a club's starters gain (above 1) or lose (below 1) from its chemistry meter. */
export function chemistryStrength(value: number): number {
  return 1 + (MAX_STRENGTH_SHARE * (clamp(value, 0, 100) - NEUTRAL_CHEMISTRY)) / NEUTRAL_CHEMISTRY;
}

/** The formation the club plays: its human coach's, else its AI coach's usual one. */
function formationOfClub(state: GameState, clubId: string, squad: readonly SimPlayer[]): Formation {
  if (clubId === state.coachClubId) return state.coach.tactics.formation;
  const waiting = waitingCoachesOf(state).find((coach) => coach.clubId === clubId);
  return waiting ? waiting.coach.tactics.formation : formationOf(state, clubId, squad);
}

/** Each squad player's standing in the dressing room, 0–100, the most first. */
function standingsOf(state: GameState, clubId: string, squad: readonly SimPlayer[]): { playerId: string; standing: number }[] {
  const atClub = state.history.players[clubId] ?? {};
  const morale = clubMood(state, clubId).squad;
  const mostMinutes = Math.max(0, ...squad.map((p) => p.condition.seasonMinutes));
  const strengths = squad.map((p) => p.strength);
  return squad
    .map((player) => {
      const record = atClub[player.id];
      const apps = record?.apps ?? 0;
      const isIdol = apps >= IDOL_APPS || (record?.goals ?? 0) >= IDOL_GOALS;
      const weaker = strengths.filter((s) => s < player.strength).length;
      const rank = squad.length > 1 ? weaker / (squad.length - 1) : 1;
      const isLeftOut = mostMinutes >= LEFT_OUT_AFTER_MINUTES && player.condition.seasonMinutes < LEFT_OUT_SHARE * mostMinutes;
      const standing =
        AGE_POINTS * clamp((player.age - AGE_FROM) / (AGE_TO - AGE_FROM), 0, 1) +
        RANK_POINTS * rank +
        APPS_POINTS * Math.min(1, apps / APPS_FOR_FULL) +
        (isIdol ? IDOL_POINTS : 0) +
        (isLeftOut ? 0 : (MORALE_POINTS * morale) / 100);
      return { playerId: player.id, standing: Math.round(clamp(standing, 0, 100)) };
    })
    .sort((a, b) => b.standing - a.standing || (a.playerId < b.playerId ? -1 : 1));
}

/** The eleven the meter reads: the last one the club started, with anyone gone replaced as its AI coach would. */
function elevenOf(state: GameState, clubId: string, squad: readonly SimPlayer[], formation: Formation, record: ClubChemistry | undefined): SimPlayer[] {
  const inSquad = new Map(squad.map((p) => [p.id, p]));
  const kept = (record?.eleven.length ? record.eleven : [...usualStartersOf(state, clubId)]).flatMap((id) => inSquad.get(id) ?? []);
  if (kept.length >= 11 || squad.length <= kept.length) return kept.slice(0, 11);
  return pickMatchLineup(squad, { date: state.date, pitch: "natural" }, formation, new Set(kept.map((p) => p.id)));
}

const hasSettled = (player: SimPlayer, date: string) => player.condition.arrivedOn === null || daysBetween(player.condition.arrivedOn, date) >= SETTLED_AT_CLUB_DAYS;

/** Neighbours of the eleven in its formation who have both settled at the club, each linked to his two nearest. */
function goodPairs(state: GameState, clubId: string, eleven: readonly SimPlayer[], formation: Formation): ChemistryLink[] {
  const slots = FORMATIONS[formation];
  const placed = arrange(eleven, formation).flatMap((player, s) => {
    const slot = slots[s];
    return player && slot ? [{ player, x: slot.x, y: slot.y }] : [];
  });
  const atClub = state.history.players[clubId] ?? {};
  const links = new Map<string, ChemistryLink>();
  for (const a of placed) {
    if (!hasSettled(a.player, state.date)) continue;
    const near = placed
      .filter((b) => b !== a && hasSettled(b.player, state.date))
      .map((b) => ({ b, distance: Math.hypot(a.x - b.x, a.y - b.y) }))
      .filter(({ distance }) => distance <= NEIGHBOUR_DISTANCE)
      .sort((x, y) => x.distance - y.distance || byId(x.b.player, y.b.player))
      .slice(0, NEIGHBOURS);
    for (const { b } of near) {
      const ids: [string, string] = a.player.id < b.player.id ? [a.player.id, b.player.id] : [b.player.id, a.player.id];
      const apps = Math.min(atClub[ids[0]]?.apps ?? 0, atClub[ids[1]]?.apps ?? 0);
      links.set(ids.join("|"), { kind: "good", playerIds: ids, weight: Math.min(MAX_LINK_WEIGHT, 1 + apps / LINK_APPS) });
    }
  }
  return [...links.values()].sort((x, y) => (x.playerIds.join() < y.playerIds.join() ? -1 : 1));
}

const mainPosition = (player: SimPlayer) => player.positions?.[0] ?? player.group;

/** Each starter's strongest fit reserve in his main position who is about as good, at most one rival a reserve. */
function rivalPairs(eleven: readonly SimPlayer[], squad: readonly SimPlayer[], date: string): ChemistryLink[] {
  const starters = new Set(eleven.map((p) => p.id));
  const reserves = squad.filter((p) => !starters.has(p.id) && !isInjured(p, date)).sort((a, b) => b.strength - a.strength || byId(a, b));
  const taken = new Set<string>();
  const links: ChemistryLink[] = [];
  for (const starter of eleven) {
    const rival = reserves.find((r) => !taken.has(r.id) && mainPosition(r) === mainPosition(starter) && r.strength >= starter.strength - RIVAL_GAP);
    if (!rival) continue;
    taken.add(rival.id);
    links.push({ kind: "rival", playerIds: [starter.id, rival.id], weight: 1 });
  }
  return links;
}

/** Pairs of the squad who fought in the dressing room lately. */
function fightPairs(state: GameState, clubId: string, squad: readonly SimPlayer[]): ChemistryLink[] {
  const inSquad = new Set(squad.map((p) => p.id));
  const since = addDays(state.date, -FIGHT_FOR_DAYS);
  const links = new Map<string, ChemistryLink>();
  for (const record of eventsOf(state, { typeId: "dressing-room-fight", clubId, since })) {
    const { playerId, teammateId } = record;
    if (!playerId || !teammateId || !inSquad.has(playerId) || !inSquad.has(teammateId)) continue;
    links.set(`${playerId}|${teammateId}`, { kind: "fight", playerIds: [playerId, teammateId], weight: 1 });
  }
  return [...links.values()];
}

/**
 * A club's chemistry today, from what it kept between matches and the squad as it is: `squad` is the
 * club's players, all of them when left out. A club that never played a match in the game starts its
 * eleven's history neutral and is read from its usual eleven.
 */
export function chemistryOf(state: GameState, clubId: string, squad: readonly SimPlayer[] = Object.values(state.players).filter((p) => p.clubId === clubId)): Chemistry {
  const record = state.chemistry?.[clubId];
  const formation = formationOfClub(state, clubId, squad);
  const eleven = elevenOf(state, clubId, squad, formation, record);
  const candidates = standingsOf(state, clubId, squad);
  const named = record?.captainId !== undefined ? candidates.find((c) => c.playerId === record.captainId) : undefined;
  const captain = named ?? candidates[0];

  const reasons: ChemistryReason[] = [];
  const settled = Math.round(clamp(record?.settled ?? 0, -SETTLED_LIMIT, SETTLED_LIMIT));
  reasons.push({ kind: "settled", points: settled, steadyGames: record?.steadyGames ?? 0, kept: record?.kept ?? 0 });
  if (captain) reasons.push({ kind: "captain", points: Math.round((CAPTAIN_POINTS * (captain.standing - NEUTRAL_CHEMISTRY)) / NEUTRAL_CHEMISTRY), playerId: captain.playerId, standing: captain.standing });
  const newcomers = eleven.filter((p) => p.condition.arrivedOn !== null && daysBetween(p.condition.arrivedOn, state.date) < NEW_FOR_DAYS).map((p) => p.id);
  if (newcomers.length) reasons.push({ kind: "newcomers", points: Math.max(NEWCOMERS_FLOOR, NEWCOMER_POINTS * newcomers.length), playerIds: newcomers });
  const good = goodPairs(state, clubId, eleven, formation);
  const rivals = rivalPairs(eleven, squad, state.date);
  const fights = fightPairs(state, clubId, squad);
  if (rivals.length) reasons.push({ kind: "rivals", points: Math.max(RIVALS_FLOOR, RIVAL_POINTS * rivals.length), playerIds: rivals.flatMap((l) => l.playerIds) });
  if (fights.length) reasons.push({ kind: "fights", points: Math.max(FIGHTS_FLOOR, FIGHT_POINTS * fights.length), playerIds: fights.flatMap((l) => l.playerIds) });
  const pairPoints = Math.min(PAIRS_CAP, Math.floor(good.length / 2));
  if (pairPoints) reasons.push({ kind: "pairs", points: pairPoints, playerIds: good.flatMap((l) => l.playerIds) });

  const value = clamp(Math.round(NEUTRAL_CHEMISTRY + reasons.reduce((sum, r) => sum + r.points, 0)), 0, 100);
  return {
    value,
    was: record?.was ?? value,
    reasons: reasons.filter((r) => r.points !== 0),
    formation,
    eleven: eleven.map((p) => p.id),
    captain: captain ? { playerId: captain.playerId, standing: captain.standing, isNamed: captain === named } : null,
    candidates,
    links: [...good, ...rivals, ...fights],
  };
}
