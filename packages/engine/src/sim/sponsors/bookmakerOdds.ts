import { matchOdds } from "../../engine/match.js";
import { guestClubOf, guestSquadOf } from "../continental/guestClubs.js";
import type { Fixture, GameState, SimPlayer } from "../gameState.js";
import { clubMood } from "../morale/clubMood.js";
import { withoutCrowd } from "../morale/withoutCrowd.js";
import { paramsForCompetition } from "../paramsForCompetition.js";
import { matchSetup } from "../players/matchSetup.js";
import { squadsOfGame } from "../players/squadsByClub.js";

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
 * A fixture's odds as a bookmaker would post them before kick-off: the engine's own chances for the elevens
 * both coaches would pick today, each shortened by the margin in proportion. It reads the game and draws nothing.
 */
export function bookmakerOdds(state: GameState, fixture: Fixture): MatchPrices {
  const squads = squadsOfGame(state);
  const squadOf = (clubId: string): readonly SimPlayer[] => {
    const guest = squads.has(clubId) ? null : guestClubOf(state, clubId);
    return guest ? guestSquadOf(guest) : (squads.get(clubId) ?? []);
  };
  const setup = matchSetup(state, fixture, squadOf, { lineup: null, tactics: state.coach.tactics });
  const competition = state.competitions[fixture.competitionId];
  const params = competition ? withoutCrowd(paramsForCompetition(competition, fixture.stage), clubMood(state, fixture.homeId)) : undefined;
  const chances = matchOdds(setup.home, setup.away, params);
  return { home: price(chances.home), draw: price(chances.draw), away: price(chances.away) };
}
