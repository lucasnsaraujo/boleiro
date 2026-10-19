/** Goals and results of a set of matches; `goalsSquared` gives the spread of goals per match. */
export type ScoreTally = { matches: number; home: number; draw: number; away: number; goals: number; goalsSquared: number };

export const emptyScoreTally = (): ScoreTally => ({ matches: 0, home: 0, draw: 0, away: 0, goals: 0, goalsSquared: 0 });

export function addScore(tally: ScoreTally, homeGoals: number, awayGoals: number): void {
  const total = homeGoals + awayGoals;
  tally.matches++;
  tally.goals += total;
  tally.goalsSquared += total * total;
  tally[homeGoals > awayGoals ? "home" : homeGoals === awayGoals ? "draw" : "away"]++;
}

export function mergeScoreTallies(tallies: readonly ScoreTally[]): ScoreTally {
  const merged = emptyScoreTally();
  for (const tally of tallies) {
    merged.matches += tally.matches;
    merged.home += tally.home;
    merged.draw += tally.draw;
    merged.away += tally.away;
    merged.goals += tally.goals;
    merged.goalsSquared += tally.goalsSquared;
  }
  return merged;
}

export const goalsPerMatch = (tally: ScoreTally) => tally.goals / Math.max(1, tally.matches);
export const goalsVariance = (tally: ScoreTally) => tally.goalsSquared / Math.max(1, tally.matches) - goalsPerMatch(tally) ** 2;
