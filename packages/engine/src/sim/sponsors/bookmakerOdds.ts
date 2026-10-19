import { matchOdds } from "../../engine/match.js";
import { openDisciplineDay } from "../discipline/recordCards.js";
import type { Fixture, GameState } from "../gameState.js";
import { fixtureSides, squadsOf, waitingPlansOf } from "../live/startMatchDay.js";
import { withLoaneesFacingOwner } from "../transfers/loans.js";

/**
 * The bookmaker's margin on a 1X2 market: the average closing overround of the market's odds on Série A
 * from 2022 on, 6.26% over 1,809 matches (football-data.co.uk's AvgC columns in
 * data/history/brasileirao-serie-a-odds.csv; Bet365's own is 6.61% over 491).
 */
export const BOOKMAKER_MARGIN = 0.0626;

/** Decimal odds for the home win, the draw and the away win. */
export type MatchPrices = { home: number; draw: number; away: number };

const price = (chance: number) => Math.max(1.01, Math.round(100 / (chance * (1 + BOOKMAKER_MARGIN))) / 100);

/**
 * A fixture's odds as a bookmaker would post them before kick-off: the chances the match engine would draw it
 * from if it were played today (fixtureSides: the elevens each coach would pick, without the suspended, each
 * human coach's tactics and each player's form of the day), each shortened by the margin in proportion. It
 * reads the game and draws nothing.
 */
export function bookmakerOdds(state: GameState, fixture: Fixture): MatchPrices {
  const competition = state.competitions[fixture.competitionId];
  if (!competition) throw new Error(`fixture ${fixture.id} has no competition ${fixture.competitionId}`);
  const suspended = withLoaneesFacingOwner(openDisciplineDay(state.discipline).suspended(fixture.competitionId), state, fixture);
  const coach = { lineup: null, tactics: state.coach.tactics };
  const { setup, params } = fixtureSides(state, fixture, competition, squadsOf(state), { coach, waiting: waitingPlansOf(state, {}), suspended });
  const chances = matchOdds(setup.home, setup.away, params);
  return { home: price(chances.home), draw: price(chances.draw), away: price(chances.away) };
}
