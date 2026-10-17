import { COACH_ROSTER, COACH_ROSTER_SEEN_ON } from "@boleiro/data/coachRoster";
import type { Formation } from "../../engine/formations.js";
import type { Posture } from "../../engine/match.js";
import { keyedSeed, randomStream } from "../../engine/random.js";
import { addDays } from "../dates.js";
import type { GameState, IsoDate } from "../gameState.js";
import type { CompetitionKey } from "../history/history.js";
import type { Country, WorldClub } from "../world/world.js";
import { clubStatures } from "./clubStatures.js";
import { inventCoachName } from "./inventCoachName.js";

/** A spell of an AI coach at a club; `left` says how it ended, null while it runs. */
export type AiCoachStint = { clubId: string; from: IsoDate; until: IsoDate | null; left: "fired" | "replaced" | "retired" | null };

export type CoachTitle = { season: number; competition: CompetitionKey; clubId: string };

/**
 * A coach the game runs: a club's head coach, or out of work in the free pool (`clubId` null).
 * `nationality` is the country as Transfermarkt writes it ("Spain"); `reputation` runs on the
 * player's coach's scale, 0 (unknown) to 100. `isReal` marks a club's real coach from Transfermarkt;
 * `formerPlayer` a star of the game who retired and took up coaching; `retiredIn` the season a coach
 * retired, kept for the rankings and the history, never hired again.
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
  retiredIn?: number;
};

/** A retired star who starts coaching in `season`, in the free pool. */
export type Rookie = { name: string; born: number; nationality: string; clubId: string; strength: number; reputation: number; season: number };

/**
 * One season's ranking points, filed at its end: each club's domestic and continental points, before its
 * country's weight (rankings.ts applies it); and for each coach (an AI coach by id, a human
 * by humanKey) the clubs he ran that season with the share of the year at each.
 */
export type SeasonPoints = { season: number; domestic: Record<string, number>; continental: Record<string, number>; credits: Record<string, [clubId: string, share: number][]> };

/**
 * A part of the game's AI coaches, on a random stream of its own so their moves never reshuffle the
 * matches: the coaches, in a job or in the pool; the clubs without a coach and the day each job opened;
 * the ranking points of the seasons the rankings read; and each closed season's standing, which a save
 * from before them lacks.
 */
export type Coaching = { rngState: number; nextId: number; coaches: Record<string, AiCoach>; openJobs: Record<string, IsoDate>; seasons: SeasonPoints[]; standings?: PartStanding[] };

/** A ranking, best first: each coach's key or club's id with its points. */
export type Ranked = [key: string, points: number][];

/** A club's or a coach's points in one country over the five seasons to a standing, before the country's weight. */
export type StandingRow = [key: string, country: string, points: number];

/**
 * A part of the game's rankings as they stood at a season's end, kept for history once its points are
 * gone: its clubs' and its coaches' rows, and for the full tier the top of the CBF's ranking.
 */
export type PartStanding = { season: number; clubs: StandingRow[]; coaches: StandingRow[]; national?: Ranked };

/**
 * The full tier's coaches (Brazil's clubs, the clubs abroad in the full tier, the Club World Cup's
 * guests) and its pool; the retired stars on their way into it; the CBF-style national points of the
 * seasons the rankings read; and how many of UEFA's winners they have read.
 */
export type CoachWorld = Coaching & { rookies: Rookie[]; national: { season: number; clubs: Record<string, number> }[]; uefaFiled?: number };

/** A result-only country's coaches and pool, apart from the rest, and how many of its filed seasons the rankings have read. */
export type CountryCoaching = Coaching & { filed: number };

/** The full tier's clubs and the Club World Cup's guests, each with the country it plays in ("br" for Brazil). */
export function fullTierClubs(state: Pick<GameState, "clubs" | "guests">): Map<string, string> {
  const clubs = new Map<string, string>();
  for (const club of Object.values(state.clubs)) clubs.set(club.id, club.abroad?.country ?? "br");
  for (const [country, members] of Object.entries(state.guests ?? {})) for (const { id } of members) if (!clubs.has(id)) clubs.set(id, country);
  return clubs;
}

/** Each club's coach in this part of the game. */
export function coachesByClub(coaching: Pick<Coaching, "coaches">): Map<string, AiCoach> {
  const byClub = new Map<string, AiCoach>();
  for (const coach of Object.values(coaching.coaches)) if (coach.clubId) byClub.set(coach.clubId, coach);
  return byClub;
}

/** The result-only countries that run their own coaches: every country of the world but those a human brought into the full tier. */
export function countriesCoaching(state: Pick<GameState, "world">): [string, Country & { coaching: CountryCoaching }][] {
  return Object.entries(state.world ?? {}).flatMap(([id, country]): [string, Country & { coaching: CountryCoaching }][] =>
    country.coaching && !country.isFullTier ? [[id, { ...country, coaching: country.coaching }]] : [],
  );
}

/** Every AI coach of the game: the full tier's and each result-only country's. */
export function everyCoach(state: Pick<GameState, "coaches" | "world">): AiCoach[] {
  return [...Object.values(state.coaches?.coaches ?? {}), ...countriesCoaching(state).flatMap(([, country]) => Object.values(country.coaching.coaches))];
}

/** Mean strength of a squad's best fourteen. */
export function squadLevel(strengths: readonly number[]): number {
  const best = [...strengths].sort((a, b) => b - a).slice(0, 14);
  return best.reduce((sum, s) => sum + s, 0) / Math.max(1, best.length);
}

/** Each club's percentile (0 smallest, 100 biggest) by squad level, among `clubs`. */
export function staturesByStrength(clubs: readonly WorldClub[]): Map<string, number> {
  const sorted = clubs.map((club) => ({ id: club.id, level: squadLevel(club.strengths) })).sort((a, b) => a.level - b.level || a.id.localeCompare(b.id));
  const last = Math.max(1, sorted.length - 1);
  return new Map(sorted.map(({ id }, index) => [id, Math.round((100 * index) / last)]));
}

/** How big each full-tier club is, 0 to 100: its board's stature, or for a Club World Cup guest its percentile by squad level among its country's. */
export function fullTierStatures(state: Pick<GameState, "clubs" | "finances" | "guests">): Map<string, number> {
  const statures = clubStatures(state);
  for (const clubs of Object.values(state.guests ?? {})) for (const [id, stature] of staturesByStrength(clubs)) if (!statures.has(id)) statures.set(id, stature);
  return statures;
}

const clamp = (value: number) => Math.round(Math.min(100, Math.max(0, value)));

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
const POOL_MIN = 2;
const POOL_REPUTATION = { min: 5, span: 60 };

/** A new invented coach of `country`, with an id under `prefix`, at `clubId` since `from` or out of work. */
export function inventCoach(
  coaching: Pick<Coaching, "nextId">,
  prefix: string,
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
  return { id: `${prefix}c${coaching.nextId}`, name, nationality, born, reputation: clamp(reputation), formation, style: styleOf(random), clubId, stints, titles: [] };
}

type Opening = { prefix: string; date: IsoDate; season: number; formations: Readonly<Record<string, Formation>> };

/**
 * The coaches of `clubs` (club id and country) on the game's day one: each club's real coach where
 * Transfermarkt lists him, an invented local one elsewhere, and a pool of invented coaches out of work.
 * The human coaches' clubs get no AI coach; their real coaches start out of work.
 */
function openCoaching(clubs: readonly [string, string][], statures: ReadonlyMap<string, number>, humans: ReadonlySet<string>, seed: number, { prefix, date, season, formations }: Opening): Coaching {
  const stream = randomStream(seed);
  const random = stream.next;
  const coaching: Coaching = { rngState: 0, nextId: 0, coaches: {}, openJobs: {}, seasons: [] };
  const add = (coach: AiCoach) => {
    coaching.coaches[coach.id] = coach;
    coaching.nextId += 1;
  };
  const rosterYear = Number(COACH_ROSTER_SEEN_ON.slice(0, 4));
  const sorted = [...clubs].sort(([a], [b]) => a.localeCompare(b));
  for (const [clubId, country] of sorted) {
    const stature = statures.get(clubId) ?? 0;
    const real = COACH_ROSTER[clubId];
    const formation = formations[clubId];
    if (real) {
      const age = real.age ?? INVENTED_AGE.min + Math.floor(random() * INVENTED_AGE.span);
      const bonus = Math.min(REAL_REPUTATION_BONUS_MAX, Math.max(0, (age - 40) * REAL_REPUTATION_PER_YEAR_OVER_40));
      const isHuman = humans.has(clubId);
      // A coach the lists show taking over after the game's day one has been in charge from it.
      const from = real.since < date ? real.since : date;
      const coach = inventCoach(coaching, prefix, country, stature + bonus, season, null, null, random);
      add({
        ...coach,
        name: real.name,
        nationality: real.nationality || coach.nationality,
        born: rosterYear - age,
        formation: formation ?? coach.formation,
        clubId: isHuman ? null : clubId,
        stints: [{ clubId, from, until: isHuman ? date : null, left: isHuman ? "replaced" : null }],
        isReal: true,
      });
      continue;
    }
    if (humans.has(clubId)) continue;
    const reputation = stature - INVENTED_REPUTATION_SPREAD.below + random() * (INVENTED_REPUTATION_SPREAD.below + INVENTED_REPUTATION_SPREAD.above);
    const coach = inventCoach(coaching, prefix, country, reputation, season, clubId, addDays(date, -Math.floor(random() * INVENTED_TENURE_DAYS)), random);
    add(formation ? { ...coach, formation } : coach);
  }
  const poolSize = Math.max(POOL_MIN, Math.ceil(sorted.length * POOL_PER_CLUB));
  for (let i = 0; i < poolSize && sorted.length; i++) {
    const [, country] = sorted[Math.floor(random() * sorted.length)] ?? ["", "br"];
    add(inventCoach(coaching, prefix, country, POOL_REPUTATION.min + random() * POOL_REPUTATION.span, season, null, null, random));
  }
  return { ...coaching, rngState: stream.state() };
}

const formationsOf = (state: Pick<GameState, "usualLineups">): Record<string, Formation> =>
  Object.fromEntries(Object.entries(state.usualLineups ?? {}).map(([id, lineup]) => [id, lineup.formation]));

/** The full tier's coaches on day one, drawn from the save's seed only. */
export function openCoachWorld(state: Omit<GameState, "coaches">, humanClubIds: readonly string[]): CoachWorld {
  const opening = { prefix: "", date: state.date, season: state.season, formations: formationsOf(state) };
  const coaching = openCoaching([...fullTierClubs(state)], fullTierStatures(state), new Set(humanClubIds), keyedSeed(state.seed, "coaches"), opening);
  return { ...coaching, rookies: [], national: [], ...(state.europe ? { uefaFiled: state.europe.winners.length } : {}) };
}

/** A result-only country's coaches on day one, on a stream of its own keyed by the save's seed and the country. */
export function openCountryCoaching(seed: number, id: string, country: Country, date: IsoDate, season: number): CountryCoaching {
  const clubs = Object.values(country.clubs);
  const opening = { prefix: `${id}:`, date, season, formations: {} };
  const coaching = openCoaching(clubs.map((club): [string, string] => [club.id, id]), staturesByStrength(clubs), new Set(), keyedSeed(seed, `coaches-${id}`), opening);
  return { ...coaching, filed: country.seasons.length };
}

/** The game with its AI coaches; a save from before them gets them from its seed (openCoachWorld, openCountryCoaching). */
export function withCoachWorld(state: GameState): GameState {
  const humans = [state.coachClubId, ...(state.waitingCoaches ?? []).map((coach) => coach.clubId)].filter((id): id is string => id !== null);
  const missing = Object.entries(state.world ?? {}).filter(([, country]) => !country.coaching && !country.isFullTier);
  if (state.coaches && !missing.length) return state;
  const coaches = state.coaches ?? openCoachWorld(state, humans);
  const world = state.world && {
    ...state.world,
    ...Object.fromEntries(missing.map(([id, country]) => [id, { ...country, coaching: openCountryCoaching(state.seed, id, country, state.date, state.season) }])),
  };
  return { ...state, coaches, ...(world ? { world } : {}) };
}
