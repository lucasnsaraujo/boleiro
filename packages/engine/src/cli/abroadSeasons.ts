import type { GameState } from "../sim/gameState.js";
import { cupMatches } from "../sim/world/resultOnlyCup.js";
import { leagueMatches } from "../sim/world/resultOnlyLeague.js";
import { addScore, emptyScoreTally, type ScoreTally } from "./scoreTally.js";

/** A result-only league key: its country and level, `gb-eng-1` for the Premier League. */
export type AbroadLeagueTallies = Map<string, { seasons: number; tally: ScoreTally }>;

/** The scores of every league and cup a day finished abroad: the ones `before` held that `after` replaced with the next season's. */
export function tallyFinishedAbroad(before: GameState, after: GameState, leagues: AbroadLeagueTallies, cups: Map<string, ScoreTally>): void {
  for (const [countryId, country] of Object.entries(before.world ?? {})) {
    const next = after.world?.[countryId];
    country.leagues.forEach((league, level) => {
      if (next?.leagues[level]?.id === league.id) return;
      const key = `${countryId}-${level + 1}`;
      const entry = leagues.get(key) ?? { seasons: 0, tally: emptyScoreTally() };
      entry.seasons++;
      for (const { result } of leagueMatches(league)) if (result) addScore(entry.tally, result.homeGoals, result.awayGoals);
      leagues.set(key, entry);
    });
    if (country.cup && next?.cup?.id !== country.cup.id) {
      const tally = cups.get(countryId) ?? emptyScoreTally();
      for (const { result } of cupMatches(country.cup)) if (result) addScore(tally, result.homeGoals, result.awayGoals);
      cups.set(countryId, tally);
    }
  }
}
