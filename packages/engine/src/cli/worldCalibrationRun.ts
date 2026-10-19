import type { Division } from "@boleiro/data/players";
import type { CardCompetition } from "../sim/discipline/cardRates.js";
import type { Fixture, GameState } from "../sim/gameState.js";
import { type AbroadLeagueTallies, tallyFinishedAbroad } from "./abroadSeasons.js";
import { playSeason } from "./playSeason.js";
import { addScore, emptyScoreTally, type ScoreTally } from "./scoreTally.js";
import { seasonStats, type SeasonStats, type UpsetKey, type UpsetTally } from "./seasonStats.js";
import { v1WorldStart } from "./v1World.js";

const DIVISIONS: readonly Division[] = ["A", "B", "C", "D"];
const emptyLeagues = (): Record<Division, ScoreTally> => ({ A: emptyScoreTally(), B: emptyScoreTally(), C: emptyScoreTally(), D: emptyScoreTally() });

/** What `seasons` seasons of the v1 world with no coach produced, for the calibration report. */
export type WorldCalibrationRun = {
  seed: number;
  /** Brazil's league matches per division, and the same per season of the run, first first. */
  leagues: Record<Division, ScoreTally>;
  leaguesBySeason: Record<Division, ScoreTally>[];
  /** Matches of every other competition that has a full-tier match engine, by what the competition is (Copa do Brasil, a continental cup, the states, the national teams). */
  others: Map<string, ScoreTally>;
  /** Cards per card competition, as totals, and the Copa do Brasil's matches between divisions. */
  cards: Partial<Record<CardCompetition, { games: number; yellows: number; reds: number }>>;
  cupUpsets: Partial<Record<UpsetKey, UpsetTally>>;
  abroadLeagues: AbroadLeagueTallies;
  abroadCups: Map<string, ScoreTally>;
};

function competitionLabel(state: GameState, fixture: Fixture): string | null {
  const competition = state.competitions[fixture.competitionId];
  if (!competition || competition.kind === "league") return null;
  return competition.kind === "continental" ? competition.cup : competition.kind;
}

function addTotals(into: WorldCalibrationRun, stats: SeasonStats): void {
  for (const [key, cards] of Object.entries(stats.cards) as [CardCompetition, { games: number; yellows: number; reds: number }][]) {
    const total = into.cards[key] ?? { games: 0, yellows: 0, reds: 0 };
    total.games += cards.games;
    total.yellows += cards.yellows;
    total.reds += cards.reds;
    into.cards[key] = total;
  }
  for (const [key, upset] of Object.entries(stats.cupUpsets) as [UpsetKey, UpsetTally][]) {
    const total = into.cupUpsets[key] ?? { matches: 0, win: 0, draw: 0, loss: 0, goals: 0 };
    for (const field of ["matches", "win", "draw", "loss", "goals"] as const) total[field] += upset[field];
    into.cupUpsets[key] = total;
  }
}

/** Plays `seasons` seasons of the v1 world, the leagues abroad too, and tallies what the calibration report compares. */
export function worldCalibrationRun(seed: number, seasons: number): WorldCalibrationRun {
  const run: WorldCalibrationRun = {
    seed,
    leagues: emptyLeagues(),
    leaguesBySeason: [],
    others: new Map(),
    cards: {},
    cupUpsets: {},
    abroadLeagues: new Map(),
    abroadCups: new Map(),
  };
  let state = v1WorldStart(seed);
  for (let i = 0; i < seasons; i++) {
    const play = playSeason(state, (before, after) => tallyFinishedAbroad(before, after, run.abroadLeagues, run.abroadCups));
    const thisSeason = emptyLeagues();
    run.leaguesBySeason.push(thisSeason);
    for (const fixture of play.fixtures) {
      const { result } = fixture;
      const competition = play.before.competitions[fixture.competitionId];
      if (!result || !competition) continue;
      if (competition.kind === "league" && competition.division && DIVISIONS.includes(competition.division) && !competition.abroad) {
        addScore(run.leagues[competition.division], result.homeGoals, result.awayGoals);
        addScore(thisSeason[competition.division], result.homeGoals, result.awayGoals);
        continue;
      }
      const label = competitionLabel(play.before, fixture);
      if (!label) continue;
      const tally = run.others.get(label) ?? emptyScoreTally();
      addScore(tally, result.homeGoals, result.awayGoals);
      run.others.set(label, tally);
    }
    addTotals(run, seasonStats(play));
    state = play.after;
  }
  return run;
}
