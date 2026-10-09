import type { Division } from "../data/players.js";
import { divisionGap, type DivisionGap, type Venue } from "../engine/cupUpsets.js";
import type { CardCompetition } from "../sim/discipline/cardRates.js";
import { cardsPerGame } from "../sim/discipline/cardsPerGame.js";
import type { CardCount } from "../sim/discipline/discipline.js";
import { MATCH_HOURS } from "../sim/players/matchInjuryChance.js";
import type { SeasonPlay } from "./playSeason.js";
import { foreignShare } from "./foreignShare.js";
import { emptyFlow, tallyMove, type SeasonFlow } from "./transferFlow.js";
import { clubSeasonsOf, type ClubSeason } from "./seasonRevenues.js";

export type ResultTally = { matches: number; home: number; draw: number; away: number; goals: number };
/** Cup matches between divisions, counted from the higher division's side. */
export type UpsetTally = { matches: number; win: number; draw: number; loss: number; goals: number };
export type UpsetKey = `${DivisionGap}-${Venue}`;

export type SeasonStats = {
  season: number;
  results: Record<Division, ResultTally>;
  cupUpsets: Partial<Record<UpsetKey, UpsetTally>>;
  /** Total cards, not per game. */
  cards: Partial<Record<CardCompetition, CardCount & { games: number }>>;
  clubSeasons: ClubSeason[];
  /** Moves by kind, and the share of non-Brazilian players per tier on the season's last day. */
  flow: SeasonFlow;
  injuries: { injuries: number; clubs: number; starterHours: number };
};

const CARD_COMPETITIONS: readonly CardCompetition[] = ["A", "B", "C", "D", "cup", "state"];
const STARTERS = 11;

const emptyResults = (): ResultTally => ({ matches: 0, home: 0, draw: 0, away: 0, goals: 0 });

/** Realism numbers for one finished season. */
export function seasonStats({ before, after, fixtures, injuries, moves }: SeasonPlay): SeasonStats {
  const results: Record<Division, ResultTally> = { A: emptyResults(), B: emptyResults(), C: emptyResults(), D: emptyResults() };
  const cupUpsets: Partial<Record<UpsetKey, UpsetTally>> = {};
  // Clubs below Série D count as Série D, as in the real cup data (cupDivision).
  const divisionOf = (clubId: string): Division => before.clubs[clubId]?.division ?? "D";
  const clubs = new Set<string>();
  for (const fixture of fixtures) {
    const competition = before.competitions[fixture.competitionId];
    const result = fixture.result;
    if (!competition || !result) continue;
    clubs.add(fixture.homeId).add(fixture.awayId);
    const goals = result.homeGoals + result.awayGoals;
    if (competition.kind === "league") {
      const tally = results[competition.division];
      tally.matches++;
      tally.goals += goals;
      tally[result.homeGoals > result.awayGoals ? "home" : result.homeGoals === result.awayGoals ? "draw" : "away"]++;
    }
    if (competition.kind === "cup") {
      const home = divisionOf(fixture.homeId);
      const gap = divisionGap(home, divisionOf(fixture.awayId));
      if (!gap) continue;
      const venue: Venue = gap.startsWith(home) ? "home" : "away";
      const [own, other] = venue === "home" ? [result.homeGoals, result.awayGoals] : [result.awayGoals, result.homeGoals];
      const tally = cupUpsets[`${gap}-${venue}`] ?? { matches: 0, win: 0, draw: 0, loss: 0, goals: 0 };
      tally.matches++;
      tally.goals += goals;
      tally[own > other ? "win" : own === other ? "draw" : "loss"]++;
      cupUpsets[`${gap}-${venue}`] = tally;
    }
  }
  const cards: SeasonStats["cards"] = {};
  const perGame = cardsPerGame(fixtures, before.competitions);
  for (const key of CARD_COMPETITIONS) {
    const rates = perGame[key];
    if (rates) cards[key] = { games: rates.games, yellows: rates.yellows * rates.games, reds: rates.reds * rates.games };
  }
  return {
    season: before.season,
    results,
    cupUpsets,
    cards,
    clubSeasons: clubSeasonsOf(before, after),
    flow: { ...moves.reduce(tallyMove, emptyFlow(before.season)), foreignShare: foreignShare(before) },
    injuries: { injuries: injuries.length, clubs: clubs.size, starterHours: fixtures.length * 2 * STARTERS * MATCH_HOURS },
  };
}
