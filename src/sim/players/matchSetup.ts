import type { Team } from "../../engine/match.js";
import type { Fixture, GameState, SimPlayer } from "../gameState.js";
import { effectiveStrength, type MatchContext } from "./effectiveStrength.js";
import { pickMatchLineup } from "./pickMatchLineup.js";
import { travelKm } from "./travelKm.js";

export type MatchSetup = {
  context: MatchContext;
  homeLineup: SimPlayer[];
  awayLineup: SimPlayer[];
  awayTravelKm: number;
  /** The lineups as the engine sees them, at today's effective strength. */
  home: Team;
  away: Team;
};

/**
 * Both elevens for a fixture played today on the home club's pitch. AI clubs pick with
 * pickMatchLineup; the coach's club plays `coachLineup` when he gave one.
 */
export function matchSetup(
  state: GameState,
  fixture: Fixture,
  squadOf: (clubId: string) => readonly SimPlayer[],
  coachLineup: readonly SimPlayer[] | null,
): MatchSetup {
  const homeClub = state.clubs[fixture.homeId];
  const awayClub = state.clubs[fixture.awayId];
  if (!homeClub || !awayClub) throw new Error(`fixture ${fixture.id} has an unknown club`);
  const context: MatchContext = { date: fixture.date, pitch: homeClub.pitch };
  const lineupOf = (clubId: string) =>
    coachLineup && clubId === state.coachClubId ? [...coachLineup] : pickMatchLineup(squadOf(clubId), context);
  const team = (name: string, lineup: readonly SimPlayer[]): Team => ({
    name,
    players: lineup.map((p) => ({ name: p.name, group: p.group, strength: effectiveStrength(p, context) })),
  });
  const homeLineup = lineupOf(homeClub.id);
  const awayLineup = lineupOf(awayClub.id);
  return {
    context,
    homeLineup,
    awayLineup,
    awayTravelKm: travelKm(awayClub.state, homeClub.state),
    home: team(homeClub.shortName, homeLineup),
    away: team(awayClub.shortName, awayLineup),
  };
}
