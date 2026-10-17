import type { GameState } from "../gameState.js";
import { countriesCoaching, fullTierClubs, type SeasonPoints } from "./aiCoaches.js";
import { countryFactors, SEASON_WEIGHTS } from "./rankingPoints.js";

type Ranked = [key: string, points: number][];

/** The seasons ranked so far, oldest first. */
export function rankedSeasons(state: Pick<GameState, "coaches">): number[] {
  return (state.coaches?.national ?? []).map((filed) => filed.season);
}

/** The weight a filed season has in the ranking as of `season`: 5 for it, 4 for the one before, down to 1; 0 outside the five. */
const weightOf = (filed: number, season: number): number => (filed > season ? 0 : (SEASON_WEIGHTS[season - filed] ?? 0));

const sorted = (total: Map<string, number>): Ranked => [...total].map(([key, points]): [string, number] => [key, Math.round(points)]).sort(([a, x], [b, y]) => y - x || a.localeCompare(b));

/** Each part of the game's filed seasons, with the country each of its clubs plays in. */
function partsOf(state: Pick<GameState, "coaches" | "world" | "clubs" | "guests">): { seasons: readonly SeasonPoints[]; countryOf: (clubId: string) => string }[] {
  const clubs = fullTierClubs(state);
  return [
    { seasons: state.coaches?.seasons ?? [], countryOf: (clubId) => clubs.get(clubId) ?? "br" },
    ...countriesCoaching(state).map(([id, country]) => ({ seasons: country.coaching.seasons, countryOf: () => id })),
  ];
}

/** The latest ranked season when none is asked for. */
const asOfSeason = (state: Pick<GameState, "coaches">, season: number | undefined) => season ?? rankedSeasons(state).at(-1) ?? 0;

/** Brazil's clubs ranked the CBF's way as of `season` (the latest when left out), best first. */
export function nationalRanking(state: Pick<GameState, "coaches">, season?: number): Ranked {
  const asOf = asOfSeason(state, season);
  const total = new Map<string, number>();
  for (const filed of state.coaches?.national ?? []) {
    const weight = weightOf(filed.season, asOf);
    if (weight) for (const [clubId, points] of Object.entries(filed.clubs)) total.set(clubId, (total.get(clubId) ?? 0) + weight * points);
  }
  return sorted(total);
}

/** A club's points in one filed season, its domestic ones weighed by its country. */
function seasonPointsOf(filed: SeasonPoints, clubId: string, factor: number): number {
  return (filed.domestic[clubId] ?? 0) * factor + (filed.continental[clubId] ?? 0);
}

/** Every club of the game ranked by its domestic points weighed by its country and its continental ones, over the five seasons to `season`. */
export function worldRanking(state: Pick<GameState, "coaches" | "world" | "clubs" | "guests" | "players">, season?: number): Ranked {
  const asOf = asOfSeason(state, season);
  const factors = countryFactors(state);
  const total = new Map<string, number>();
  for (const { seasons, countryOf } of partsOf(state)) {
    for (const filed of seasons) {
      const weight = weightOf(filed.season, asOf);
      if (!weight) continue;
      for (const clubId of new Set([...Object.keys(filed.domestic), ...Object.keys(filed.continental)])) {
        total.set(clubId, (total.get(clubId) ?? 0) + weight * seasonPointsOf(filed, clubId, factors.get(countryOf(clubId)) ?? 0));
      }
    }
  }
  return sorted(total);
}

/** Every coach, AI and human, ranked by his clubs' world points for the share of each season he ran them, over the five seasons to `season`. */
export function coachRanking(state: Pick<GameState, "coaches" | "world" | "clubs" | "guests" | "players">, season?: number): Ranked {
  const asOf = asOfSeason(state, season);
  const factors = countryFactors(state);
  const total = new Map<string, number>();
  for (const { seasons, countryOf } of partsOf(state)) {
    for (const filed of seasons) {
      const weight = weightOf(filed.season, asOf);
      if (!weight) continue;
      for (const [key, credits] of Object.entries(filed.credits)) {
        const points = credits.reduce((sum, [clubId, share]) => sum + share * seasonPointsOf(filed, clubId, factors.get(countryOf(clubId)) ?? 0), 0);
        if (points > 0) total.set(key, (total.get(key) ?? 0) + weight * points);
      }
    }
  }
  return sorted(total);
}
