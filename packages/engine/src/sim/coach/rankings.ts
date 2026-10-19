import type { GameState } from "../gameState.js";
import { countriesCoaching, fullTierClubs, type Coaching, type PartStanding, type Ranked, type StandingRow } from "./aiCoaches.js";
import { countryFactors, SEASON_WEIGHTS } from "./rankingPoints.js";
import { compareText } from "../compareText.js";

/** How many places of each ranking a closed season keeps for history. */
export const STANDING_PLACES = 50;

/** The seasons ranked so far, oldest first: those with a standing kept and those whose points are. */
export function rankedSeasons(state: Pick<GameState, "coaches">): number[] {
  const seasons = [...(state.coaches?.standings ?? []), ...(state.coaches?.national ?? [])].map((filed) => filed.season);
  return [...new Set(seasons)].sort((a, b) => a - b);
}

/** The weight a filed season has in the ranking as of `season`: 5 for it, 4 for the one before, down to 1; 0 outside the five. */
const weightOf = (filed: number, season: number): number => (filed > season ? 0 : (SEASON_WEIGHTS[season - filed] ?? 0));

const sorted = (total: Map<string, number>): Ranked => [...total].map(([key, points]): [string, number] => [key, Math.round(points)]).sort(([a, x], [b, y]) => y - x || compareText(a, b));

/** A part of the game: its coaching and the country each of its clubs plays in. */
export type RankedPart = { coaching: Pick<Coaching, "seasons" | "standings">; countryOf: (clubId: string) => string };

/** The full tier, then each result-only country, with the country each of its clubs plays in. */
export function partsOf(state: Pick<GameState, "coaches" | "world" | "clubs" | "guests">): RankedPart[] {
  const clubs = fullTierClubs(state);
  return [
    { coaching: state.coaches ?? { seasons: [] }, countryOf: (clubId) => clubs.get(clubId) ?? "br" },
    ...countriesCoaching(state).map(([id, country]): RankedPart => ({ coaching: country.coaching, countryOf: () => id })),
  ];
}

/** The latest ranked season when none is asked for. */
const asOfSeason = (state: Pick<GameState, "coaches">, season: number | undefined) => season ?? rankedSeasons(state).at(-1) ?? 0;

/** Every club's and every coach's (AI by id, human by humanKey) points in a part over the five seasons to `season`, by country, from its filed points. */
export function partStanding({ coaching, countryOf }: RankedPart, season: number): PartStanding {
  const clubs = new Map<string, StandingRow>();
  const coaches = new Map<string, StandingRow>();
  const add = (rows: Map<string, StandingRow>, key: string, country: string, points: number) => {
    const id = `${key} ${country}`;
    rows.set(id, [key, country, (rows.get(id)?.[2] ?? 0) + points]);
  };
  for (const filed of coaching.seasons) {
    const weight = weightOf(filed.season, season);
    if (!weight) continue;
    const pointsOf = (clubId: string) => (filed.domestic[clubId] ?? 0) + (filed.continental[clubId] ?? 0);
    for (const clubId of new Set([...Object.keys(filed.domestic), ...Object.keys(filed.continental)])) add(clubs, clubId, countryOf(clubId), weight * pointsOf(clubId));
    for (const [key, credits] of Object.entries(filed.credits)) for (const [clubId, share] of credits) add(coaches, key, countryOf(clubId), weight * share * pointsOf(clubId));
  }
  return { season, clubs: [...clubs.values()], coaches: [...coaches.values()] };
}

/** A part's standing as of `season`: from its points while it holds that season as its latest, else as kept at that season's end. */
function standingAsOf(part: RankedPart, season: number): PartStanding | null {
  const { seasons, standings } = part.coaching;
  const isLive = seasons.at(-1)?.season === season;
  const kept = isLive ? undefined : standings?.find((standing) => standing.season === season);
  return kept ?? (seasons.some((filed) => filed.season === season) ? partStanding(part, season) : null);
}

/** Rows summed by key, each weighed by its country, best first. */
function weighed(rows: readonly StandingRow[], factors: ReadonlyMap<string, number>): Ranked {
  const total = new Map<string, number>();
  for (const [key, country, points] of rows) total.set(key, (total.get(key) ?? 0) + points * (factors.get(country) ?? 0));
  return sorted(total);
}

/** Brazil's clubs ranked the CBF's way as of `season` (the latest when left out), best first; an earlier season's top as it was kept. */
export function nationalRanking(state: Pick<GameState, "coaches">, season?: number): Ranked {
  const asOf = asOfSeason(state, season);
  const national = state.coaches?.national ?? [];
  const kept = national.at(-1)?.season === asOf ? undefined : state.coaches?.standings?.find((standing) => standing.season === asOf)?.national;
  if (kept) return kept;
  const total = new Map<string, number>();
  for (const filed of national) {
    const weight = weightOf(filed.season, asOf);
    if (weight) for (const [clubId, points] of Object.entries(filed.clubs)) total.set(clubId, (total.get(clubId) ?? 0) + weight * points);
  }
  return sorted(total);
}

type RankingState = Pick<GameState, "coaches" | "world" | "clubs" | "guests" | "players">;

/** Every club of the game ranked by its domestic and continental points weighed by its country, over the five seasons to `season`. */
export function worldRanking(state: RankingState, season?: number): Ranked {
  const asOf = asOfSeason(state, season);
  return weighed(partsOf(state).flatMap((part) => standingAsOf(part, asOf)?.clubs ?? []), countryFactors(state));
}

/** Every coach, AI and human, who ran a club in the five seasons to `season`, ranked by his clubs' world points for the share of each season he ran them. */
export function coachRanking(state: RankingState, season?: number): Ranked {
  const asOf = asOfSeason(state, season);
  return weighed(partsOf(state).flatMap((part) => standingAsOf(part, asOf)?.coaches ?? []), countryFactors(state));
}
