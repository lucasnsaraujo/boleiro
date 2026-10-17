import { assistantTalk, kickOffMoment, type TalkMoment, type TalkTone } from "@boleiro/engine/sim/live/teamTalk";
import type { Role } from "@boleiro/data/players";
import type { Formation } from "@boleiro/engine/engine/formations";
import type { PositionGroup } from "@boleiro/engine/engine/match";
import { startersKept } from "@boleiro/engine/sim/coach/assistantDuties";
import { DEFAULT_TACTICS, type Tactics } from "@boleiro/engine/sim/coach/tactics";
import type { BoardSide, MatchMoment } from "@boleiro/engine/sim/coach/tacticsBoard";
import { chemistryOf } from "@boleiro/engine/sim/chemistry/chemistryOf";
import { waitingCoachesOf } from "@boleiro/engine/sim/coach/humanCoaches";
import { guestClubOf, guestSquadOf } from "@boleiro/engine/sim/continental/guestClubs";
import { openDisciplineDay, YELLOWS_PER_BAN } from "@boleiro/engine/sim/discipline/recordCards";
import { yellowPhase } from "@boleiro/engine/sim/discipline/yellowPhase";
import type { Fixture, GameState, SimPlayer } from "@boleiro/engine/sim/gameState";
import type { MatchContext } from "@boleiro/engine/sim/players/effectiveStrength";
import { fatigueOn } from "@boleiro/engine/sim/players/fatigueOn";
import { isInjured } from "@boleiro/engine/sim/players/isInjured";
import { matchClubOf, playingStrength } from "@boleiro/engine/sim/players/matchSetup";
import { pickMatchLineup } from "@boleiro/engine/sim/players/pickMatchLineup";
import { formationOf, usualStartersOf } from "@boleiro/engine/sim/players/usualLineups";
import { withLoaneesFacingOwner } from "@boleiro/engine/sim/transfers/loans";
import { fixtureLabel } from "../format/competitionName.js";

/** Why a player can't play today: hurt, banned, or on loan from today's opponent (`facesOwner`). */
export type PlayerStatus = "injured" | "suspended" | "facesOwner" | null;

/**
 * One of the coach's players as the lineup sheet shows him: his positions (main first; none when the
 * data has none, and then his group is his position), today's strength, fatigue from 0 to 100, why he
 * can't play, and whether one more yellow in today's competition bans him.
 */
export type SquadPlayer = {
  id: string;
  name: string;
  group: PositionGroup;
  positions?: readonly Role[];
  strength: number;
  fatigue: number;
  status: PlayerStatus;
  isOneYellowFromBan?: boolean;
};

/**
 * What the lineup sheet opens with before kick-off: the squad, the eleven it opens on (keeper first, in
 * its slots' order) and the coach's tactics. The sheet opens on the assistant's pick in the coach's
 * formation (`assistantLineup`) while he runs the lineup, else on the coach's last eleven, with only
 * those who can't play today replaced.
 */
export type MatchDayPlan = {
  fixtureId: string;
  clubId: string;
  homeId: string;
  awayId: string;
  label: string;
  squad: SquadPlayer[];
  lineup: string[];
  assistantLineup: string[];
  tactics: Tactics;
  /** The formation the opponent's coach plays. */
  opponentFormation: Formation;
  /** The opponent's likely eleven and its coach's tactics, for the tactics board. */
  opponent: BoardSide;
  /** The opponent's last five results in any competition, oldest first. */
  opponentForm: MatchResult[];
  moment: MatchMoment;
  /** The club's chemistry meter, its captain and the assistant's pick for the armband. */
  chemistry: { value: number; captainId: string | null; suggestedCaptainId: string | null };
  /** Where the club stands for a talk before kick-off, and the tone the assistant would take. */
  talk: { moment: TalkMoment; suggested: TalkTone };
};

export type MatchResult = "win" | "draw" | "loss";
const FORM_LENGTH = 5;

/** A club's last five results in any competition, oldest first. */
export function recentResultsOf(fixtures: readonly Fixture[], clubId: string): MatchResult[] {
  return fixtures
    .filter((f) => f.result && (f.homeId === clubId || f.awayId === clubId))
    .toSorted((a, b) => a.date.localeCompare(b.date))
    .slice(-FORM_LENGTH)
    .flatMap((f): MatchResult[] => {
      if (!f.result) return [];
      const [scored, conceded] = f.homeId === clubId ? [f.result.homeGoals, f.result.awayGoals] : [f.result.awayGoals, f.result.homeGoals];
      return [scored > conceded ? "win" : scored === conceded ? "draw" : "loss"];
    });
}

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

/** Whether one more yellow in the fixture's competition bans each player. */
function isOneYellowFromBanIn(state: Pick<GameState, "discipline" | "competitions">, fixture: Fixture): (playerId: string) => boolean {
  const competition = state.competitions[fixture.competitionId];
  const records = state.discipline[fixture.competitionId] ?? {};
  const phase = competition ? yellowPhase(competition, fixture.stage) : 0;
  return (playerId) => {
    const record = records[playerId];
    return record !== undefined && record.phase >= phase && record.yellows === YELLOWS_PER_BAN - 1;
  };
}

/** The coach's squad for today's match, goalkeepers first and strongest first within each position. */
export function squadOf(
  state: Pick<GameState, "date" | "players" | "discipline" | "competitions" | "market">,
  clubId: string,
  fixture: Fixture,
  strengthOf: (player: SimPlayer) => number,
): SquadPlayer[] {
  const suspended = openDisciplineDay(state.discipline).suspended(fixture.competitionId);
  const facingOwner = withLoaneesFacingOwner(new Set(), state, fixture);
  const isOneYellowFromBan = isOneYellowFromBanIn(state, fixture);
  return playersOf(state, clubId)
    .map((p) => ({
      id: p.id,
      name: p.name,
      group: p.group,
      ...(p.positions ? { positions: p.positions } : {}),
      strength: Math.round(strengthOf(p)),
      fatigue: Math.round(Math.min(100, fatigueOn(p, state.date))),
      status: isInjured(p, state.date) ? ("injured" as const) : suspended.has(p.id) ? ("suspended" as const) : facingOwner.has(p.id) ? ("facesOwner" as const) : null,
      ...(isOneYellowFromBan(p.id) ? { isOneYellowFromBan: true } : {}),
    }))
    .sort((a, b) => GROUP_ORDER[a.group] - GROUP_ORDER[b.group] || b.strength - a.strength);
}

/** The coach's match day before kick-off, for the lineup sheet: in his formation, or in `formation` when given. */
export function matchDayPlan(state: GameState, formation?: Formation): MatchDayPlan {
  const fixture = coachFixtureToday(state);
  const clubId = state.coachClubId ?? "";
  const context = matchContextOf(state, fixture);
  const suspended = withLoaneesFacingOwner(openDisciplineDay(state.discipline).suspended(fixture.competitionId), state, fixture);
  const available = playersOf(state, clubId).filter((p) => !suspended.has(p.id));
  const tactics = formation ? { ...state.coach.tactics, formation } : state.coach.tactics;
  const usual = usualStartersOf(state, clubId);
  const assistantLineup = pickMatchLineup(available, context, tactics.formation, usual).map((p) => p.id);
  const kept = startersKept(state.coach, state.chemistry?.[clubId]?.eleven);
  const lineup = kept ? pickMatchLineup(available, context, tactics.formation, usual, kept).map((p) => p.id) : assistantLineup;
  const competition = state.competitions[fixture.competitionId];
  const label = competition ? fixtureLabel(competition, fixture) : "";
  const { homeId, awayId } = fixture;
  const opponentId = homeId === clubId ? awayId : homeId;
  const guest = guestClubOf(state, opponentId);
  const opponentSquad = (guest ? guestSquadOf(guest) : playersOf(state, opponentId)).filter((p) => !suspended.has(p.id));
  const opponentFormation = aiFormationOf(state, opponentId);
  const squad = squadOf(state, clubId, fixture, playingStrength(state, clubId, context, available));
  const opponentStrength = playingStrength(state, opponentId, context, opponentSquad);
  const opponentEleven = pickMatchLineup(opponentSquad, context, opponentFormation, usualStartersOf(state, opponentId)).map((p) => ({
    id: p.id,
    name: p.name,
    group: p.group,
    ...(p.positions ? { positions: p.positions } : {}),
    strength: opponentStrength(p),
  }));
  // A rival human coach plays his own tactics; his eleven stays the assistant's guess until his turn.
  const rivalTactics = waitingCoachesOf(state).find((waiting) => waiting.clubId === opponentId)?.coach.tactics;
  const opponent: BoardSide = {
    name: matchClubOf(state, opponentId)?.shortName ?? opponentId,
    eleven: opponentEleven,
    tactics: rivalTactics ?? { ...DEFAULT_TACTICS, formation: opponentFormation },
  };
  const moment: MatchMoment = { isHome: homeId === clubId, minute: 0, lead: 0 };
  const opponentForm = recentResultsOf(state.fixtures, opponentId);
  const own = chemistryOf(state, clubId);
  const chemistry = { value: own.value, captainId: own.captain?.playerId ?? null, suggestedCaptainId: own.candidates[0]?.playerId ?? null };
  const talkMoment = kickOffMoment(state, fixture, clubId);
  const talk = { moment: talkMoment, suggested: assistantTalk(talkMoment) };
  return { fixtureId: fixture.id, clubId, homeId, awayId, label, squad, lineup, assistantLineup, tactics, opponentFormation, opponent, opponentForm, moment, chemistry, talk };
}
