import { loadDivisions, type HistoricalMatch } from "../data/history.js";
import type { Division } from "../data/players.js";
import { cupDivision, DIVISION_GAPS, divisionGap, realCupMatches, type DivisionGap, type DivisionSquads } from "./cupUpsets.js";
import { scoreDistribution, type EngineParams, type Team } from "./match.js";

export type TwoLegTies = {
  gap: DivisionGap;
  ties: number;
  /** Share of ties the higher-division club lost, shootouts included. */
  favouriteOut: number;
};

/** Same coin flip as PENALTY_SHOOTOUT_HOME_WIN in src/sim/advanceDay.ts; real favourites won 10 of the 20 shootouts here. */
const FAVOURITE_WINS_SHOOTOUT = 0.5;

/**
 * Two matches between the same clubs in one cup season form a two-leg tie. Two ties ended
 * level with no shootout recorded (decided on away goals); they are left out.
 */
export function realTwoLegTies(): TwoLegTies[] {
  const divisions = loadDivisions();
  const pairs = new Map<string, HistoricalMatch[]>();
  for (const match of realCupMatches()) {
    const key = `${match.season}:${[match.home.ref, match.away.ref].sort().join("|")}`;
    pairs.set(key, [...(pairs.get(key) ?? []), match]);
  }
  const tally = new Map<DivisionGap, { ties: number; out: number }>();
  for (const legs of pairs.values()) {
    const [first, second] = legs;
    if (legs.length !== 2 || !first || !second) continue;
    const firstHome = cupDivision(divisions, first, "home");
    const gap = divisionGap(firstHome, cupDivision(divisions, first, "away"));
    if (!gap) continue;
    const favourite = gap.startsWith(firstHome) ? first.home.ref : first.away.ref;
    const goals = (favouriteSide: boolean) =>
      legs.reduce((sum, m) => sum + ((m.home.ref === favourite) === favouriteSide ? m.homeGoals : m.awayGoals), 0);
    const [own, other] = [goals(true), goals(false)];
    let out: boolean;
    if (own !== other) out = own < other;
    else if (second.penaltyWinner) out = second[second.penaltyWinner].ref !== favourite;
    else continue;
    const count = tally.get(gap) ?? { ties: 0, out: 0 };
    count.ties++;
    if (out) count.out++;
    tally.set(gap, count);
  }
  return DIVISION_GAPS.map((gap) => {
    const { ties, out } = tally.get(gap) ?? { ties: 0, out: 0 };
    return { gap, ties, favouriteOut: ties ? out / ties : Number.NaN };
  });
}

/** Distribution of (favourite goals − underdog goals) in one match, offset by MAX so index 0 is −MAX. */
function marginDistribution(grid: number[][], favouriteAtHome: boolean): number[] {
  const max = grid.length - 1;
  const margins = new Array<number>(2 * max + 1).fill(0);
  grid.forEach((row, hg) =>
    row.forEach((p, ag) => {
      const margin = favouriteAtHome ? hg - ag : ag - hg;
      margins[margin + max] = (margins[margin + max] ?? 0) + p;
    }),
  );
  return margins;
}

function favouriteOutChance(favourite: Team, underdog: Team, params: EngineParams): number {
  const first = marginDistribution(scoreDistribution(underdog, favourite, params), false);
  const second = marginDistribution(scoreDistribution(favourite, underdog, params), true);
  const max = (first.length - 1) / 2;
  let out = 0;
  first.forEach((p1, i) =>
    second.forEach((p2, j) => {
      const margin = i - max + (j - max);
      if (margin < 0) out += p1 * p2;
      else if (margin === 0) out += p1 * p2 * (1 - FAVOURITE_WINS_SHOOTOUT);
    }),
  );
  return out;
}

/**
 * Every pairing of current squads, favourite at home in the second leg. With no away-goals rule
 * the aggregate does not depend on leg order, so one order covers both.
 */
export function simulatedTwoLegTies(squads: DivisionSquads, params: EngineParams): TwoLegTies[] {
  return DIVISION_GAPS.map((gap) => {
    const [higher, lower] = [gap[0], gap[2]] as [Division, Division];
    let out = 0;
    let ties = 0;
    for (const favourite of squads[higher]) {
      for (const underdog of squads[lower]) {
        out += favouriteOutChance(favourite, underdog, params);
        ties++;
      }
    }
    return { gap, ties, favouriteOut: out / ties };
  });
}
