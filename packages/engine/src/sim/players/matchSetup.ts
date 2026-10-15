import { inFormation, type Formation } from "../../engine/formations.js";
import type { Team } from "../../engine/match.js";
import { DEFAULT_TACTICS, type Tactics } from "../coach/tactics.js";
import type { Fixture, GameState, SimPlayer } from "../gameState.js";
import { clubMood } from "../morale/clubMood.js";
import { moraleStrength } from "../morale/moraleStrength.js";
import { effectiveStrength, type MatchContext } from "./effectiveStrength.js";
import { pickMatchLineup } from "./pickMatchLineup.js";
import { travelKm } from "./travelKm.js";
import { formationOf, usualStartersOf } from "./usualLineups.js";

export type MatchSetup = {
  context: MatchContext;
  homeLineup: SimPlayer[];
  awayLineup: SimPlayer[];
  awayTravelKm: number;
  /** The lineups as the engine sees them, at today's effective strength and morale. */
  home: Team;
  away: Team;
  formations: { home: Formation; away: Formation };
};

/** The coach's choices for his club's match: his eleven, or none to let the AI pick it in his formation. */
export type CoachPlan = { lineup: readonly SimPlayer[] | null; tactics: Tactics };

/** The strength each player of a club plays at in this match: effective strength plus morale. */
export function playingStrength(state: GameState, clubId: string, context: MatchContext, squad: readonly SimPlayer[]): (player: SimPlayer) => number {
  const morale = clubMood(state, clubId).squad;
  const mostMinutes = Math.max(0, ...squad.map((p) => p.condition.seasonMinutes));
  return (p) => Math.max(1, effectiveStrength(p, context) + moraleStrength(p, morale, mostMinutes, context.date));
}

/** An eleven as the engine sees it; with tactics, placed in their formation by position, with their posture and penalty taker. */
export function engineTeam(name: string, lineup: readonly SimPlayer[], strength: (player: SimPlayer) => number, tactics?: Tactics): Team {
  const players = lineup.map((p) => ({ name: p.name, group: p.group, strength: strength(p), ...(p.positions ? { positions: p.positions } : {}) }));
  if (!tactics) return { name, players };
  const taker = players[lineup.findIndex((p) => p.id === tactics.penaltyTakerId)];
  return { name, players: inFormation(players, tactics.formation), posture: tactics.posture, ...(taker ? { penaltyTaker: taker } : {}) };
}

/**
 * Both elevens for a fixture played today on the home club's pitch. AI clubs pick with
 * pickMatchLineup in their usual formation; the coach's club plays the coach's eleven, or the AI's
 * pick in his formation. Every eleven plays placed in its formation by position (inFormation).
 */
export function matchSetup(
  state: GameState,
  fixture: Fixture,
  squadOf: (clubId: string) => readonly SimPlayer[],
  coach: CoachPlan,
): MatchSetup {
  const homeClub = state.clubs[fixture.homeId];
  const awayClub = state.clubs[fixture.awayId];
  if (!homeClub || !awayClub) throw new Error(`fixture ${fixture.id} has an unknown club`);
  const context: MatchContext = { date: fixture.date, pitch: homeClub.pitch };
  const isCoach = (clubId: string) => clubId === state.coachClubId;
  const tacticsOf = (clubId: string): Tactics => (isCoach(clubId) ? coach.tactics : { ...DEFAULT_TACTICS, formation: formationOf(state, clubId, squadOf(clubId)) });
  const lineupOf = (clubId: string, tactics: Tactics) =>
    isCoach(clubId) && coach.lineup ? [...coach.lineup] : pickMatchLineup(squadOf(clubId), context, tactics.formation, usualStartersOf(state, clubId));
  const team = (clubId: string, name: string, lineup: readonly SimPlayer[], tactics: Tactics): Team =>
    engineTeam(name, lineup, playingStrength(state, clubId, context, squadOf(clubId)), tactics);
  const homeTactics = tacticsOf(homeClub.id);
  const awayTactics = tacticsOf(awayClub.id);
  const homeLineup = lineupOf(homeClub.id, homeTactics);
  const awayLineup = lineupOf(awayClub.id, awayTactics);
  return {
    context,
    homeLineup,
    awayLineup,
    awayTravelKm: travelKm(awayClub.state, homeClub.state),
    home: team(homeClub.id, homeClub.shortName, homeLineup, homeTactics),
    away: team(awayClub.id, awayClub.shortName, awayLineup, awayTactics),
    formations: { home: homeTactics.formation, away: awayTactics.formation },
  };
}
