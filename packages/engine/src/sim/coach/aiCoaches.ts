import { COACH_ROSTER, COACH_ROSTER_SEEN_ON } from "@boleiro/data/coachRoster";
import type { Formation } from "../../engine/formations.js";
import type { Posture } from "../../engine/match.js";
import { keyedSeed, randomStream } from "../../engine/random.js";
import { addDays } from "../dates.js";
import type { GameState, IsoDate } from "../gameState.js";
import type { CompetitionKey } from "../history/history.js";
import { clubStatures } from "./clubStatures.js";
import { inventCoachName } from "./inventCoachName.js";

/** A spell of an AI coach at a club; `left` says how it ended, null while it runs. */
export type AiCoachStint = { clubId: string; from: IsoDate; until: IsoDate | null; left: "fired" | "replaced" | "retired" | null };

export type CoachTitle = { season: number; competition: CompetitionKey; clubId: string };

/**
 * A coach the game runs: a club's head coach, or out of work in the free pool (`clubId` null).
 * `nationality` is the country as Transfermarkt writes it ("Spain"); `reputation` runs on the
 * player's coach's scale, 0 (unknown) to 100. `isReal` marks a club's real coach from Transfermarkt;
 * `formerPlayer` a star of the game who retired and took up coaching.
 */
export type AiCoach = {
  id: string;
  name: string;
  nationality: string;
  born: number;
  reputation: number;
  formation: Formation;
  style: Posture;
  clubId: string | null;
  stints: AiCoachStint[];
  titles: CoachTitle[];
  isReal?: true;
  formerPlayer?: { clubId: string; strength: number };
};

/** A retired star who starts coaching in `season`, in the free pool. */
export type Rookie = { name: string; born: number; nationality: string; clubId: string; strength: number; reputation: number; season: number };

/**
 * One season's ranking points, filed at its end: the clubs' national ones (Brazil's, the CBF's way),
 * the clubs' world ones and the coaches' (AI coaches by id, human coaches by `humanKey`).
 */
export type RankedSeason = { season: number; national: Record<string, number>; world: Record<string, number>; coaches: Record<string, number> };

/**
 * Every AI coach in the game, on a random stream of their own so their moves never reshuffle the
 * matches. `openJobs` are the AI clubs without a coach and the day each job opened; `rankings` the
 * last seasons' points, oldest first; `podiums` each filed season's top of each ranking, kept for good.
 */
export type CoachWorld = {
  rngState: number;
  nextId: number;
  coaches: Record<string, AiCoach>;
  openJobs: Record<string, IsoDate>;
  rookies: Rookie[];
  rankings: RankedSeason[];
  podiums: Podium[];
};

/** A filed season's top coaches and clubs in each ranking, by key and points, best first. */
export type Podium = { season: number; coaches: [string, number][]; national: [string, number][]; world: [string, number][] };

/** Every club of the game with the country it plays in: Brazil's ("br"), the full tier's abroad, the result-only world's and the Club World Cup's guests. */
export function clubsOfWorld(state: Pick<GameState, "clubs" | "world" | "guests">): Map<string, string> {
  const clubs = new Map<string, string>();
  for (const club of Object.values(state.clubs)) clubs.set(club.id, club.abroad?.country ?? "br");
  for (const [country, { clubs: members }] of Object.entries(state.world ?? {})) for (const id of Object.keys(members)) if (!clubs.has(id)) clubs.set(id, country);
  for (const [country, members] of Object.entries(state.guests ?? {})) for (const { id } of members) if (!clubs.has(id)) clubs.set(id, country);
  return clubs;
}

/** Each AI-coached club's coach. */
export function coachesByClub(world: Pick<CoachWorld, "coaches">): Map<string, AiCoach> {
  const byClub = new Map<string, AiCoach>();
  for (const coach of Object.values(world.coaches)) if (coach.clubId) byClub.set(coach.clubId, coach);
  return byClub;
}

const clamp = (value: number) => Math.round(Math.min(100, Math.max(0, value)));

/** How big each club is, 0 to 100, among its country's: the boards' stature, or for a club with no board, its percentile by squad strength. */
export function worldStatures(state: Pick<GameState, "clubs" | "finances" | "world" | "guests">): Map<string, number> {
  const statures = clubStatures(state);
  const byCountry = new Map<string, { id: string; strength: number }[]>();
  const add = (country: string, id: string, strengths: readonly number[]) => {
    if (statures.has(id)) return;
    const best = [...strengths].sort((a, b) => b - a).slice(0, 14);
    const strength = best.reduce((sum, s) => sum + s, 0) / Math.max(1, best.length);
    byCountry.set(country, [...(byCountry.get(country) ?? []), { id, strength }]);
  };
  for (const [country, { clubs }] of Object.entries(state.world ?? {})) for (const club of Object.values(clubs)) add(country, club.id, club.strengths);
  for (const [country, clubs] of Object.entries(state.guests ?? {})) for (const club of clubs) add(country, club.id, club.strengths);
  for (const clubs of byCountry.values()) {
    const sorted = [...clubs].sort((a, b) => a.strength - b.strength || a.id.localeCompare(b.id));
    const last = Math.max(1, sorted.length - 1);
    sorted.forEach(({ id }, index) => statures.set(id, Math.round((100 * index) / last)));
  }
  return statures;
}

const FORMATIONS: readonly Formation[] = ["4-3-3", "4-2-3-1", "4-4-2", "3-5-2", "4-1-4-1", "3-4-3", "5-3-2"];
// guess: half the coaches play balanced, a quarter go forward and a quarter sit back.
function styleOf(random: () => number): Posture {
  const draw = random();
  return draw < 0.5 ? "balanced" : draw < 0.75 ? "attacking" : "defensive";
}

// guess: an invented coach is 35 to 65, his reputation a few points either side of his club's stature.
const INVENTED_AGE = { min: 35, span: 30 };
const INVENTED_REPUTATION_SPREAD = { below: 8, above: 4 };
// guess: a real coach's reputation is his club's stature, a little more for the experienced ones.
const REAL_REPUTATION_PER_YEAR_OVER_40 = 0.5;
const REAL_REPUTATION_BONUS_MAX = 8;
// guess: an invented coach has been at his club up to two and a half years when the game starts.
const INVENTED_TENURE_DAYS = 900;
// guess: about one coach out of work for every twelve clubs, so a fired coach's club finds a successor.
const POOL_PER_CLUB = 1 / 12;
const POOL_REPUTATION = { min: 5, span: 60 };

/** A new invented coach of `country`, at `clubId` since `from` or out of work. */
export function inventCoach(
  world: Pick<CoachWorld, "nextId">,
  country: string,
  reputation: number,
  season: number,
  clubId: string | null,
  from: IsoDate | null,
  random: () => number,
): AiCoach {
  const { name, nationality } = inventCoachName(country, random);
  const born = season - INVENTED_AGE.min - Math.floor(random() * INVENTED_AGE.span);
  const formation = FORMATIONS[Math.floor(random() * FORMATIONS.length)] ?? "4-4-2";
  const stints = clubId && from ? [{ clubId, from, until: null, left: null }] : [];
  return { id: `c${world.nextId}`, name, nationality, born, reputation: clamp(reputation), formation, style: styleOf(random), clubId, stints, titles: [] };
}

// The coaches' own stream, apart from the matches' and every other system's.
const COACH_STREAM_KEY = "coaches";

/**
 * Every club's coach on the game's day one: the club's real coach where Transfermarkt lists him, an
 * invented local one elsewhere, and a free pool of invented coaches. The human coaches' clubs get no
 * AI coach (the player replaces the real one, who starts out of work). Drawn from the save's seed
 * only, so a save from before AI coaches gets the same world back whenever it loads.
 */
export function openCoachWorld(state: Omit<GameState, "coaches">, humanClubIds: readonly string[]): CoachWorld {
  const stream = randomStream(keyedSeed(state.seed, COACH_STREAM_KEY));
  const random = stream.next;
  const statures = worldStatures(state);
  const humans = new Set(humanClubIds);
  const world: CoachWorld = { rngState: 0, nextId: 0, coaches: {}, openJobs: {}, rookies: [], rankings: [], podiums: [] };
  const add = (coach: AiCoach) => {
    world.coaches[coach.id] = coach;
    world.nextId += 1;
  };
  const rosterYear = Number(COACH_ROSTER_SEEN_ON.slice(0, 4));
  const clubs = [...clubsOfWorld(state)].sort(([a], [b]) => a.localeCompare(b));
  for (const [clubId, country] of clubs) {
    const stature = statures.get(clubId) ?? 0;
    const real = COACH_ROSTER[clubId];
    const formation = state.usualLineups?.[clubId]?.formation;
    if (real) {
      const age = real.age ?? INVENTED_AGE.min + Math.floor(random() * INVENTED_AGE.span);
      const bonus = Math.min(REAL_REPUTATION_BONUS_MAX, Math.max(0, (age - 40) * REAL_REPUTATION_PER_YEAR_OVER_40));
      const isHuman = humans.has(clubId);
      // A coach the lists show taking over after the game's day one has been in charge from it.
      const from = real.since < state.date ? real.since : state.date;
      const coach = inventCoach(world, country, stature + bonus, state.season, null, null, random);
      add({
        ...coach,
        name: real.name,
        nationality: real.nationality || coach.nationality,
        born: rosterYear - age,
        formation: formation ?? coach.formation,
        clubId: isHuman ? null : clubId,
        stints: [{ clubId, from, until: isHuman ? state.date : null, left: isHuman ? "replaced" : null }],
        isReal: true,
      });
      continue;
    }
    if (humans.has(clubId)) continue;
    const reputation = stature - INVENTED_REPUTATION_SPREAD.below + random() * (INVENTED_REPUTATION_SPREAD.below + INVENTED_REPUTATION_SPREAD.above);
    const coach = inventCoach(world, country, reputation, state.season, clubId, addDays(state.date, -Math.floor(random() * INVENTED_TENURE_DAYS)), random);
    add(formation ? { ...coach, formation } : coach);
  }
  const poolSize = Math.ceil(clubs.length * POOL_PER_CLUB);
  for (let i = 0; i < poolSize; i++) {
    const [, country] = clubs[Math.floor(random() * clubs.length)] ?? ["", "br"];
    add(inventCoach(world, country, POOL_REPUTATION.min + random() * POOL_REPUTATION.span, state.season, null, null, random));
  }
  return { ...world, rngState: stream.state() };
}

/** The game with its AI coaches; a save from before them gets them from its seed (openCoachWorld). */
export function withCoachWorld(state: GameState): GameState {
  if (state.coaches) return state;
  const humans = [state.coachClubId, ...(state.waitingCoaches ?? []).map((coach) => coach.clubId)].filter((id): id is string => id !== null);
  return { ...state, coaches: openCoachWorld(state, humans) };
}
