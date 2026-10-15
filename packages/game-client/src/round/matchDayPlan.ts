import type { Role } from "@boleiro/data/players";
import type { Formation } from "@boleiro/engine/engine/formations";
import type { PositionGroup } from "@boleiro/engine/engine/match";
import type { Tactics } from "@boleiro/engine/sim/coach/tactics";
import { guestClubOf, guestSquadOf } from "@boleiro/engine/sim/continental/guestClubs";
import { openDisciplineDay } from "@boleiro/engine/sim/discipline/recordCards";
import type { Fixture, GameState, SimPlayer } from "@boleiro/engine/sim/gameState";
import type { MatchContext } from "@boleiro/engine/sim/players/effectiveStrength";
import { fatigueOn } from "@boleiro/engine/sim/players/fatigueOn";
import { isInjured } from "@boleiro/engine/sim/players/isInjured";
import { matchClubOf, playingStrength } from "@boleiro/engine/sim/players/matchSetup";
import { pickMatchLineup } from "@boleiro/engine/sim/players/pickMatchLineup";
import { formationOf, usualStartersOf } from "@boleiro/engine/sim/players/usualLineups";
import { fixtureLabel } from "../format/competitionName.js";

export type PlayerStatus = "injured" | "suspended" | null;

/**
 * One of the coach's players as the lineup sheet shows him: his positions (main first; none when the
 * data has none, and then his group is his position), today's strength, fatigue from 0 to 100, and why he can't play.
 */
export type SquadPlayer = { id: string; name: string; group: PositionGroup; positions?: readonly Role[]; strength: number; fatigue: number; status: PlayerStatus };

/** What the lineup sheet opens with before kick-off: the squad, the eleven the assistant would pick in the coach's formation (keeper first, in its slots' order), and his tactics. */
export type MatchDayPlan = {
  fixtureId: string;
  clubId: string;
  homeId: string;
  awayId: string;
  label: string;
  squad: SquadPlayer[];
  lineup: string[];
  tactics: Tactics;
  /** The formation the opponent's coach plays. */
  opponentFormation: Formation;
};

const GROUP_ORDER: Record<PositionGroup, number> = { GK: 0, DEF: 1, MID: 2, ATT: 3 };

function coachFixtureToday(state: Pick<GameState, "date" | "coachClubId" | "fixtures">): Fixture {
  const { date, coachClubId } = state;
  const fixture = state.fixtures.find((f) => f.date === date && !f.result && (f.homeId === coachClubId || f.awayId === coachClubId));
  if (!coachClubId || !fixture) throw new Error("the coach has no match today");
  return fixture;
}

function matchContextOf(state: GameState, fixture: Fixture): MatchContext {
  const home = matchClubOf(state, fixture.homeId);
  if (!home) throw new Error(`fixture ${fixture.id} has an unknown club`);
  return { date: fixture.date, pitch: home.pitch };
}

/** The formation a club's AI coach plays, a continental guest's included. */
export function aiFormationOf(state: GameState, clubId: string): Formation {
  const guest = guestClubOf(state, clubId);
  return formationOf(state, clubId, guest ? guestSquadOf(guest) : playersOf(state, clubId));
}

function playersOf(state: Pick<GameState, "players">, clubId: string): SimPlayer[] {
  const squad: SimPlayer[] = [];
  for (const id in state.players) {
    const player = state.players[id];
    if (player?.clubId === clubId) squad.push(player);
  }
  return squad;
}

/** The coach's squad for today's match, goalkeepers first and strongest first within each position. */
export function squadOf(state: Pick<GameState, "date" | "players" | "discipline">, clubId: string, fixture: Fixture, strengthOf: (player: SimPlayer) => number): SquadPlayer[] {
  const suspended = openDisciplineDay(state.discipline).suspended(fixture.competitionId);
  return playersOf(state, clubId)
    .map((p) => ({
      id: p.id,
      name: p.name,
      group: p.group,
      ...(p.positions ? { positions: p.positions } : {}),
      strength: Math.round(strengthOf(p)),
      fatigue: Math.round(Math.min(100, fatigueOn(p, state.date))),
      status: isInjured(p, state.date) ? ("injured" as const) : suspended.has(p.id) ? ("suspended" as const) : null,
    }))
    .sort((a, b) => GROUP_ORDER[a.group] - GROUP_ORDER[b.group] || b.strength - a.strength);
}

/** The coach's match day before kick-off, for the lineup sheet: in his formation, or in `formation` when given. */
export function matchDayPlan(state: GameState, formation?: Formation): MatchDayPlan {
  const fixture = coachFixtureToday(state);
  const clubId = state.coachClubId ?? "";
  const context = matchContextOf(state, fixture);
  const suspended = openDisciplineDay(state.discipline).suspended(fixture.competitionId);
  const available = playersOf(state, clubId).filter((p) => !suspended.has(p.id));
  const tactics = formation ? { ...state.coach.tactics, formation } : state.coach.tactics;
  const lineup = pickMatchLineup(available, context, tactics.formation, usualStartersOf(state, clubId)).map((p) => p.id);
  const competition = state.competitions[fixture.competitionId];
  const label = competition ? fixtureLabel(competition, fixture) : "";
  const { homeId, awayId } = fixture;
  const opponentFormation = aiFormationOf(state, homeId === clubId ? awayId : homeId);
  const squad = squadOf(state, clubId, fixture, playingStrength(state, clubId, context, available));
  return { fixtureId: fixture.id, clubId, homeId, awayId, label, squad, lineup, tactics, opponentFormation };
}
