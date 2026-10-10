import type { Club } from "../../src/data/clubs.js";
import type { Division } from "../../src/data/players.js";
import { clubHistory, type ClubHistory } from "../../src/sim/history/clubHistory.js";
import type { CoachRecord, CoachStint, CompetitionKey, History, TopScorer } from "../../src/sim/history/history.js";

const NATIONAL_KEYS: readonly CompetitionKey[] = ["serie-a", "serie-b", "serie-c", "serie-d", "copa-do-brasil"];

/** The roll's columns: the national competitions, then the coach's own state championship. */
export function rollKeys(clubs: Readonly<Record<string, Pick<Club, "state">>>, coachClubId: string | null): CompetitionKey[] {
  const state = coachClubId ? clubs[coachClubId]?.state : undefined;
  return state ? [...NATIONAL_KEYS, `state-${state.toLowerCase()}`] : [...NATIONAL_KEYS];
}

export type ChampionRow = { season: number; isCurrent: boolean; champions: (string | null)[] };

/** Each season's champion per column, newest first; the season under way leads once it has a champion. */
export function championRoll(history: Pick<History, "seasons" | "current">, keys: readonly CompetitionKey[]): ChampionRow[] {
  const row = (season: number, isCurrent: boolean, champions: Record<CompetitionKey, string>): ChampionRow => ({
    season,
    isCurrent,
    champions: keys.map((key) => champions[key] ?? null),
  });
  const { current } = history;
  const filed = history.seasons.map((s) => row(s.season, false, s.champions)).toReversed();
  return Object.keys(current.champions).length ? [row(current.season, true, current.champions), ...filed] : filed;
}

export type ScorerRow = { season: number; scorers: (TopScorer | null)[] };

/** Each filed season's top scorer per column, newest first. */
export function scorerRoll(history: Pick<History, "seasons">, keys: readonly CompetitionKey[]): ScorerRow[] {
  return history.seasons.map((s) => ({ season: s.season, scorers: keys.map((key) => s.topScorers[key] ?? null) })).toReversed();
}

const rankOf = (key: CompetitionKey) => (NATIONAL_KEYS.includes(key) ? NATIONAL_KEYS.indexOf(key) : NATIONAL_KEYS.length);

export type ClubPast = Pick<ClubHistory, "records" | "idols"> & {
  /** One line per competition won, the biggest first; seasons newest first. */
  titles: { key: CompetitionKey; seasons: number[] }[];
  finishes: { season: number; division: Division; position: number }[];
};

/** A club's titles, league finishes, records and idols. */
export function clubPast(state: { history: History }, clubId: string): ClubPast {
  const { titles, positions, records, idols } = clubHistory(state, clubId);
  const byKey = new Map<CompetitionKey, number[]>();
  for (const title of titles) byKey.set(title.competition, [title.season, ...(byKey.get(title.competition) ?? [])]);
  return {
    titles: [...byKey].map(([key, seasons]) => ({ key, seasons })).sort((a, b) => rankOf(a.key) - rankOf(b.key) || a.key.localeCompare(b.key)),
    finishes: positions.toReversed(),
    records,
    idols,
  };
}

export type CareerStint = Pick<CoachStint, "clubId" | "from" | "until" | "left"> & {
  /** Seasons the board reviewed him at the club. */
  seasons: number;
  titles: CompetitionKey[];
  firedAt: { position: number; targetPosition: number } | null;
};

/** The coach's clubs, newest first, with what he did at each. */
export function coachCareer(coach: CoachRecord): CareerStint[] {
  return coach.stints
    .map((stint) => {
      const isDuring = (date: string) => date >= stint.from && (stint.until === null || date <= stint.until);
      const firing = stint.left === "fired" ? coach.firings.find((f) => f.clubId === stint.clubId && isDuring(f.date)) : undefined;
      return {
        ...stint,
        seasons: coach.seasons.filter((s) => s.clubId === stint.clubId && isDuring(`${s.season}-12-31`)).length,
        titles: coach.trophies.filter((t) => t.clubId === stint.clubId && isDuring(`${t.season}-12-31`)).map((t) => t.competition).toReversed(),
        firedAt: firing ? { position: firing.position, targetPosition: firing.targetPosition } : null,
      };
    })
    .toReversed();
}
