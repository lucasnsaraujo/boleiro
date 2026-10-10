import type { Club } from "../../src/data/clubs.js";
import type { Tactics } from "../../src/sim/coach/tactics.js";
import type { Fixture, IsoDate } from "../../src/sim/gameState.js";
import type { LiveDay } from "../../src/sim/live/liveDay.js";
import type { MatchEvent } from "../../src/sim/live/matchTimeline.js";
import { fixtureLabel } from "../format/competitionName.js";
import { squadOf, type SquadPlayer } from "./matchDayPlan.js";

export type Side = "home" | "away";
export type RoundClub = Pick<Club, "id" | "shortName" | "colours" | "stadium">;
export type RoundMatch = { fixtureId: string; competitionId: string; homeId: string; awayId: string; events: MatchEvent[] };
export type RoundCompetition = { id: string; label: string };
/** The coach's group of his competition: its clubs and every fixture of the stage, today's still unplayed. */
export type RoundTable = { clubIds: string[]; fixtures: Fixture[]; drawOrder: string[] };

/** The coach's side of his match: who started, who may come on, and his tactics as of his last change. */
export type CoachSide = {
  fixtureId: string;
  side: Side;
  starters: string[];
  benchIds: string[];
  squad: SquadPlayer[];
  tactics: Tactics;
  lastChangeMinute: number;
};

/** A match day as the live round screen plays it back: every match's timeline and what the rows, the band and the table need. */
export type LiveRound = {
  date: IsoDate;
  coachClubId: string | null;
  /** Competitions playing today, the coach's first. */
  competitions: RoundCompetition[];
  matches: RoundMatch[];
  clubs: Record<string, RoundClub>;
  names: Record<string, string>;
  table: RoundTable | null;
  coach: CoachSide | null;
};

function tableOf(live: LiveDay, fixture: Fixture | undefined): RoundTable | null {
  if (!fixture) return null;
  const { state } = live;
  const competition = state.competitions[fixture.competitionId];
  const stage = competition?.stages[fixture.stage];
  if (!competition || stage?.kind !== "groups") return null;
  const clubIds = stage.groups.find((group) => group.includes(fixture.homeId)) ?? [];
  const inGroup = new Set(clubIds);
  const fixtures = state.fixtures.filter((f) => f.competitionId === competition.id && f.stage === fixture.stage && inGroup.has(f.homeId) && inGroup.has(f.awayId));
  return { clubIds, fixtures, drawOrder: competition.drawOrder };
}

function coachSideOf(live: LiveDay, fixture: Fixture | undefined): CoachSide | null {
  const { state, coachMatch } = live;
  if (!coachMatch || !fixture) return null;
  const side: Side = fixture.homeId === state.coachClubId ? "home" : "away";
  return {
    fixtureId: coachMatch.fixtureId,
    side,
    starters: coachMatch.starters[side].map((p) => p.id),
    benchIds: coachMatch.bench.map((p) => p.id),
    squad: squadOf(state, state.coachClubId ?? "", fixture, (p) => coachMatch.strengths[p.id] ?? p.strength),
    tactics: coachMatch.tactics,
    lastChangeMinute: coachMatch.lastChangeMinute,
  };
}

/** The live round screen's view of a live day. */
export function liveRoundOf(live: LiveDay): LiveRound {
  const { state } = live;
  const today = new Map(state.fixtures.filter((f) => f.date === state.date).map((f) => [f.id, f]));
  const coachFixture = live.coachMatch ? today.get(live.coachMatch.fixtureId) : undefined;
  const matches: RoundMatch[] = live.matches.map((m) => ({
    fixtureId: m.fixtureId,
    competitionId: today.get(m.fixtureId)?.competitionId ?? "",
    homeId: m.homeId,
    awayId: m.awayId,
    events: m.events,
  }));

  const counts = new Map<string, number>();
  for (const m of matches) counts.set(m.competitionId, (counts.get(m.competitionId) ?? 0) + 1);
  const isCoachs = (id: string) => id === coachFixture?.competitionId;
  const competitions = [...counts.keys()]
    .sort((a, b) => Number(isCoachs(b)) - Number(isCoachs(a)) || (counts.get(b) ?? 0) - (counts.get(a) ?? 0))
    .flatMap((id) => {
      const competition = state.competitions[id];
      const first = matches.find((m) => m.competitionId === id);
      const fixture = first && today.get(first.fixtureId);
      return competition && fixture ? [{ id, label: fixtureLabel(competition, fixture) }] : [];
    });

  const clubs: Record<string, RoundClub> = {};
  const names: Record<string, string> = {};
  const nameOf = (id: string) => {
    const player = state.players[id];
    if (player) names[id] = player.name;
  };
  for (const m of matches) {
    for (const id of [m.homeId, m.awayId]) {
      const club = state.clubs[id];
      if (club) clubs[id] = { id, shortName: club.shortName, colours: club.colours, stadium: club.stadium };
    }
    for (const e of m.events) {
      if ("playerId" in e) nameOf(e.playerId);
      if (e.type === "substitution") nameOf(e.offId);
    }
  }
  const coach = coachSideOf(live, coachFixture);
  for (const p of coach?.squad ?? []) names[p.id] = p.name;

  return { date: state.date, coachClubId: state.coachClubId, competitions, matches, clubs, names, table: tableOf(live, coachFixture), coach };
}
