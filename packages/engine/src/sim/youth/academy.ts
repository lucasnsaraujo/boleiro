import type { Club, State } from "@boleiro/data/clubs";
import type { Division } from "@boleiro/data/players";
import type { PositionGroup } from "../../engine/match.js";
import { randomStream } from "../../engine/random.js";
import { clubStatures } from "../coach/clubStatures.js";
import type { GameState } from "../gameState.js";
import type { SeasonRecord } from "../history/history.js";
import { CLUB_LEVEL, normal, SQUAD_SHAPE } from "../players/developPlayers.js";
import { inventName } from "../players/inventName.js";
import { inventHometown } from "./hometowns.js";
import { compareText } from "../compareText.js";
import { REAL_DIVISIONS, REAL_DIVISIONS_FROM, REAL_DIVISIONS_UNTIL } from "./realDivisions.js";

/** A kid in a club's academy. He plays only youth football until the club promotes, sells or releases him. */
export type Prospect = {
  id: string;
  clubId: string;
  name: string;
  group: PositionGroup;
  age: number;
  strength: number;
  /** Hidden: the strength he grows toward, reached in his mid-twenties. The screens show only scouted stars. */
  potential: number;
  /** Fixes where the scouts' star range sits around his true stars; drawn once, when he joins. */
  scoutDraw: number;
  /** The season he joined the academy; the scouts see him better each season after. */
  joinedSeason: number;
  hometown: string;
};

/** One Copa São Paulo de Futebol Júnior, played result-only: its matches round by round and its champion. */
export type Copinha = {
  season: number;
  matches: { round: number; homeId: string; awayId: string; homeGoals: number; awayGoals: number; penaltyWinnerId?: string }[];
  championId: string;
};

/** Every national club's academy, on a random stream of its own so the academies never reshuffle matches. */
export type Youth = {
  rngState: number;
  prospects: Record<string, Prospect>;
  /** The last Copinha played. */
  copinha?: Copinha;
};

export const YOUTH_AGES = { min: 16, max: 20 } as const;
/** The age a prospect may not reach in the academy: at the season's turn he goes up, out or to another club. */
export const LEAVING_AGE = 21;

// guess: an academy keeps 8 to 14 kids in the game's eyes (the best of each age), the biggest clubs the most.
const ACADEMY_SIZE = { min: 8, max: 14 };
// guess: a kid's potential centres on his academy's level, 3 points more at the biggest club than at an
// average one, and spreads 5 points either way (one standard deviation).
const POTENTIAL_ABOVE_LEVEL = 0;
const STATURE_EFFECT = 3;
const POTENTIAL_SD = 5;
/**
 * How far below his potential a kid plays at each age. guess: a 17-year-old is about 16 below, so a
 * Série A academy's average kid (potential ~72) plays at 56, twelve below the Série A 17-year-olds of the
 * 2026 squads; he closes most of the gap by 21 and the rest in the pros.
 */
const GAP_BY_AGE: Record<number, number> = { 16: 20, 17: 16, 18: 12, 19: 9, 20: 7, 21: 5 };
const GAP_SD = 2;
// Stars by potential: below Série C's level (56), then C, B (63), A (72) and a Série A star's 80.
const STAR_FLOORS = [0, 56, 63, 72, 80] as const;
// guess: the scouts' first look is off by up to two stars; each season he spends there takes one off.
const FIRST_SCOUT_SPAN = 2;
const YOUTH_STREAM_SALT = 0x90d75;

export const gapAt = (age: number): number => GAP_BY_AGE[Math.min(LEAVING_AGE, Math.max(YOUTH_AGES.min, age))] ?? 0;

export const clampStrength = (strength: number): number => Math.round(Math.min(99, Math.max(1, strength)) * 10) / 10;

/** The true stars, 1 to 5, a potential is worth. */
export function starsOf(potential: number): number {
  return STAR_FLOORS.filter((floor) => potential >= floor).length;
}

/**
 * The stars the club's scouts give him in `season`: a range that always holds his true stars and narrows
 * each season he stays, and by `sharperBy` stars more when a good assistant looks too (scoutSharpeningAt).
 */
export function scoutedStars(prospect: Pick<Prospect, "potential" | "scoutDraw" | "joinedSeason">, season: number, sharperBy = 0): { low: number; high: number } {
  const span = Math.max(0, FIRST_SCOUT_SPAN - (season - prospect.joinedSeason) - sharperBy);
  const truth = starsOf(prospect.potential);
  const low = Math.max(1, truth - Math.floor(prospect.scoutDraw * (span + 1)));
  return { low, high: Math.min(5, low + span) };
}

/** The clubs that keep an academy: those in a national division. A state-only club tops its squad up as before. */
/** A club of Brazil's national leagues, the ones that keep an academy. */
export type AcademyClub = Club & { state: State };

export function academyClubs(state: Pick<GameState, "clubs">): AcademyClub[] {
  return Object.values(state.clubs).filter((club): club is AcademyClub => club.division !== null && club.state !== undefined);
}

// guess: an academy works at the level of the divisions its club played over its last ten seasons, not this
// one's alone: its staff, grounds and scouting are built over years, so a newly promoted club keeps a lower
// division's academy for a while and a relegated giant keeps its own, each moving a tenth of the way a season.
const ACADEMY_SEASONS = 10;

type Filed = Pick<SeasonRecord, "season" | "tables" | "promoted" | "relegated">;

const DIVISIONS = ["A", "B", "C", "D"] as const;

const filedDivision = (record: Filed, clubId: string): Division | null => DIVISIONS.find((division) => record.tables[division].includes(clubId)) ?? null;

/** The division a season the game filed sends a club to the next: up when it was promoted, down when relegated (below Série D, none). */
function nextDivision(record: Filed, clubId: string): Division | "none" {
  const division = filedDivision(record, clubId);
  if (!division) return "none";
  const step = record.promoted[division].includes(clubId) ? -1 : record.relegated[division].includes(clubId) ? 1 : 0;
  return DIVISIONS[DIVISIONS.indexOf(division) + step] ?? "none";
}

/**
 * The division a club plays in `season`: the game's table of it; for the season the game is turning to, where the
 * one before sent it; else the real one before the game; else its current division.
 */
function divisionIn(club: Pick<Club, "id" | "division">, season: number, filed: ReadonlyMap<number, Filed>): Division | "none" {
  const record = filed.get(season);
  if (record) return filedDivision(record, club.id) ?? "none";
  const before = filed.get(season - 1);
  if (before) return nextDivision(before, club.id);
  if (season < REAL_DIVISIONS_FROM || season > REAL_DIVISIONS_UNTIL) return club.division ?? "none";
  const letter = REAL_DIVISIONS[club.id]?.[season - REAL_DIVISIONS_FROM];
  return letter === "A" || letter === "B" || letter === "C" ? letter : "D";
}

/** The level a club's academy works at for the kids who join in `season`: the mean level of its divisions over the ACADEMY_SEASONS seasons through that one, as the game filed them (`seasons`) or as they were before it. */
export function academyLevel(club: Pick<Club, "id" | "division">, season: number, seasons: readonly Filed[]): number {
  const filed = new Map(seasons.map((record) => [record.season, record]));
  let total = 0;
  for (let back = 0; back < ACADEMY_SEASONS; back++) total += CLUB_LEVEL[divisionIn(club, season - back, filed)];
  return total / ACADEMY_SEASONS;
}

/** How many kids the club keeps, by its stature (0 to 100), and how good they are, by its academy's level and its stature. */
export function academyOf(level: number, stature: number): { size: number; potentialMean: number } {
  const share = stature / 100;
  return {
    size: Math.round(ACADEMY_SIZE.min + share * (ACADEMY_SIZE.max - ACADEMY_SIZE.min)),
    potentialMean: level + POTENTIAL_ABOVE_LEVEL + STATURE_EFFECT * (2 * share - 1),
  };
}

/** The group a squad or academy of `groups` is thinnest in, against a 24-man squad's shape. */
export function thinnestGroup(groups: readonly PositionGroup[]): PositionGroup {
  const count = (group: PositionGroup) => groups.filter((g) => g === group).length / SQUAD_SHAPE[group];
  const order: readonly PositionGroup[] = ["GK", "DEF", "MID", "ATT"];
  return order.reduce((a, b) => (count(b) < count(a) ? b : a));
}

/** A new kid of `age` at the club, his potential drawn around the academy's. */
export function inventProspect(
  id: string,
  club: AcademyClub,
  potentialMean: number,
  group: PositionGroup,
  age: number,
  season: number,
  random: () => number,
): Prospect {
  const potential = clampStrength(potentialMean + POTENTIAL_SD * normal(random));
  return {
    id,
    clubId: club.id,
    name: inventName(random),
    group,
    age,
    strength: clampStrength(potential - gapAt(age) + GAP_SD * normal(random)),
    potential,
    scoutDraw: random(),
    joinedSeason: season,
    hometown: inventHometown(club.state, random),
  };
}

/** Every national club's academy at the start of a game, its kids spread over the youth ages. */
export function openAcademies(state: Pick<GameState, "clubs" | "finances" | "season" | "seed" | "history">): Youth {
  const random = randomStream((state.seed ^ YOUTH_STREAM_SALT) >>> 0);
  const statures = clubStatures(state);
  const prospects: Record<string, Prospect> = {};
  for (const club of academyClubs(state)) {
    const { size, potentialMean } = academyOf(academyLevel(club, state.season, state.history.seasons), statures.get(club.id) ?? 0);
    const groups: PositionGroup[] = [];
    for (let i = 0; i < size; i++) {
      const group = thinnestGroup(groups);
      groups.push(group);
      const age = YOUTH_AGES.min + (i % (YOUTH_AGES.max - YOUTH_AGES.min + 1));
      const id = `k${state.season}-${club.id}-${i}`;
      prospects[id] = inventProspect(id, club, potentialMean, group, age, state.season - (age - YOUTH_AGES.min), random.next);
    }
  }
  return { rngState: random.state(), prospects };
}

/** The club's academy, best first. */
export function academySquad(youth: Youth | undefined, clubId: string): Prospect[] {
  return Object.values(youth?.prospects ?? {})
    .filter((p) => p.clubId === clubId)
    .sort((a, b) => b.strength - a.strength || compareText(a.id, b.id));
}
