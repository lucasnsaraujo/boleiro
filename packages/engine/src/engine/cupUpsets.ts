import { loadDivisions, loadResults, type HistoricalMatch } from "@boleiro/data/history";
import type { Division } from "@boleiro/data/players";
import { matchOdds, type EngineParams, type Team } from "./match.js";

/** Higher division first; "D" also holds clubs below Série D (see cupDivision). */
export type DivisionGap = "AvB" | "AvC" | "AvD" | "BvC" | "BvD" | "CvD";
export type Venue = "home" | "away";

/** How the club from the higher division did, one cup match at a time. */
export type CupUpsetGroup = {
  gap: DivisionGap;
  venue: Venue;
  matches: number;
  win: number;
  draw: number;
  loss: number;
  goalsPerGame: number;
};

export type DivisionSquads = Record<Division, Team[]>;

/** ESPN has Série C standings from 2017; 2026 was still running when fetched. */
export const CUP_SEASONS = { first: 2017, last: 2025 } as const;
export const DIVISION_GAPS: readonly DivisionGap[] = ["AvB", "AvC", "AvD", "BvC", "BvD", "CvD"];
const ORDER: readonly Division[] = ["A", "B", "C", "D"];

/** A club with no A–C (ESPN) or A–D (Sofascore) standing that season played Série D or below. */
export function cupDivision(divisions: ReturnType<typeof loadDivisions>, match: HistoricalMatch, side: Venue): Division {
  return divisions.get(match.season)?.get(match[side].ref) ?? "D";
}

export function divisionGap(a: Division, b: Division): DivisionGap | null {
  const [higher, lower] = ORDER.indexOf(a) < ORDER.indexOf(b) ? [a, b] : [b, a];
  const gap = `${higher}v${lower}`;
  return DIVISION_GAPS.find((known) => known === gap) ?? null;
}

export function realCupMatches(): HistoricalMatch[] {
  return loadResults("copa-do-brasil").filter((m) => m.season >= CUP_SEASONS.first && m.season <= CUP_SEASONS.last);
}

export function realCupUpsets(): CupUpsetGroup[] {
  const divisions = loadDivisions();
  const tally = new Map<string, { win: number; draw: number; loss: number; goals: number }>();
  for (const match of realCupMatches()) {
    const home = cupDivision(divisions, match, "home");
    const away = cupDivision(divisions, match, "away");
    const gap = divisionGap(home, away);
    if (!gap) continue;
    const venue: Venue = gap.startsWith(home) ? "home" : "away";
    const [own, other] = venue === "home" ? [match.homeGoals, match.awayGoals] : [match.awayGoals, match.homeGoals];
    const key = `${gap}-${venue}`;
    const count = tally.get(key) ?? { win: 0, draw: 0, loss: 0, goals: 0 };
    count.goals += own + other;
    if (own > other) count.win++;
    else if (own === other) count.draw++;
    else count.loss++;
    tally.set(key, count);
  }
  return DIVISION_GAPS.flatMap((gap) =>
    (["home", "away"] as const).map((venue) => {
      const { win, draw, loss, goals } = tally.get(`${gap}-${venue}`) ?? { win: 0, draw: 0, loss: 0, goals: 0 };
      const matches = win + draw + loss;
      return { gap, venue, matches, win: win / matches, draw: draw / matches, loss: loss / matches, goalsPerGame: goals / matches };
    }),
  );
}

/** Every pairing of a current higher-division squad with a current lower-division squad, at each venue. */
export function simulatedCupUpsets(squads: DivisionSquads, params: EngineParams): CupUpsetGroup[] {
  return DIVISION_GAPS.flatMap((gap) => {
    const [higher, lower] = [gap[0], gap[2]] as [Division, Division];
    return (["home", "away"] as const).map((venue) => {
      let win = 0;
      let draw = 0;
      let goals = 0;
      let matches = 0;
      for (const favourite of squads[higher]) {
        for (const underdog of squads[lower]) {
          const odds = venue === "home" ? matchOdds(favourite, underdog, params) : matchOdds(underdog, favourite, params);
          win += venue === "home" ? odds.home : odds.away;
          draw += odds.draw;
          goals += odds.expectedHomeGoals + odds.expectedAwayGoals;
          matches++;
        }
      }
      return { gap, venue, matches, win: win / matches, draw: draw / matches, loss: 1 - (win + draw) / matches, goalsPerGame: goals / matches };
    });
  });
}
