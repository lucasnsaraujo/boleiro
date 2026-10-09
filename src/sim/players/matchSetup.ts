import type { Team } from "../../engine/match.js";
import type { Fixture, GameState, SimPlayer } from "../gameState.js";
import { clubMood } from "../morale/clubMood.js";
import { moraleStrength } from "../morale/moraleStrength.js";
import { effectiveStrength, type MatchContext } from "./effectiveStrength.js";
import { pickMatchLineup } from "./pickMatchLineup.js";
import { travelKm } from "./travelKm.js";

export type MatchSetup = {
  context: MatchContext;
  homeLineup: SimPlayer[];
  awayLineup: SimPlayer[];
  awayTravelKm: number;
  /** The lineups as the engine sees them, at today's effective strength and morale. */
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
  const team = (clubId: string, name: string, lineup: readonly SimPlayer[]): Team => {
    const morale = clubMood(state, clubId).squad;
    const mostMinutes = Math.max(0, ...squadOf(clubId).map((p) => p.condition.seasonMinutes));
    const strength = (p: SimPlayer) => Math.max(1, effectiveStrength(p, context) + moraleStrength(p, morale, mostMinutes, context.date));
    return { name, players: lineup.map((p) => ({ name: p.name, group: p.group, strength: strength(p) })) };
  };
  const homeLineup = lineupOf(homeClub.id);
  const awayLineup = lineupOf(awayClub.id);
  return {
    context,
    homeLineup,
    awayLineup,
    awayTravelKm: travelKm(awayClub.state, homeClub.state),
    home: team(homeClub.id, homeClub.shortName, homeLineup),
    away: team(awayClub.id, awayClub.shortName, awayLineup),
  };
}
