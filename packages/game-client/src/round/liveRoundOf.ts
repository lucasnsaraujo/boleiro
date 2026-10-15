import type { Club } from "@boleiro/data/clubs";
import type { Tactics } from "@boleiro/engine/sim/coach/tactics";
import { guestClubOf, guestSquadOf } from "@boleiro/engine/sim/continental/guestClubs";
import type { Fixture, IsoDate } from "@boleiro/engine/sim/gameState";
import type { LiveDay } from "@boleiro/engine/sim/live/liveDay";
import type { MatchEvent } from "@boleiro/engine/sim/live/matchTimeline";
import { fixtureLabel } from "../format/competitionName.js";
import { squadOf, type SquadPlayer } from "./matchDayPlan.js";

export type Side = "home" | "away";
export type RoundClub = Pick<Club, "id" | "shortName" | "colours" | "stadium">;

// A continental guest whose pack gives no colours shows in plain white and black.
const GUEST_COLOURS = { primary: "#FFFFFF", secondary: "#000000" };
export type RoundMatch = { fixtureId: string; competitionId: string; homeId: string; awayId: string; events: MatchEvent[] };
type RoundCompetition = { id: string; label: string };
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
  /** The furthest minute of the round the screen has shown; changes can only come from it on. */
  seenMinute: number;
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
export function liveRoundOf(live: LiveDay, seenMinute: number): LiveRound {
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

  const table = tableOf(live, coachFixture);
  const clubs: Record<string, RoundClub> = {};
  for (const id of [...matches.flatMap((m) => [m.homeId, m.awayId]), ...(table?.clubIds ?? [])]) {
    const club = state.clubs[id];
    const guest = club ? null : guestClubOf(state, id);
    if (club) clubs[id] = { id, shortName: club.shortName, colours: club.colours, stadium: club.stadium };
    else if (guest) clubs[id] = { id, shortName: guest.name, colours: guest.colours ?? GUEST_COLOURS, stadium: "" };
  }
  const guestPlayers = new Map(matches.flatMap((m) => [m.homeId, m.awayId]).flatMap((id) => {
    const guest = guestClubOf(state, id);
    return guest ? guestSquadOf(guest).map((p) => [p.id, p.name] as const) : [];
  }));
  const names: Record<string, string> = {};
  const nameOf = (id: string) => {
    const name = state.players[id]?.name ?? guestPlayers.get(id);
    if (name) names[id] = name;
  };
  for (const m of matches) {
    for (const e of m.events) {
      if ("playerId" in e) nameOf(e.playerId);
      if (e.type === "substitution") nameOf(e.offId);
    }
  }
  const coach = coachSideOf(live, coachFixture);
  for (const p of coach?.squad ?? []) names[p.id] = p.name;

  return { date: state.date, coachClubId: state.coachClubId, competitions, matches, clubs, names, table, coach, seenMinute };
}
