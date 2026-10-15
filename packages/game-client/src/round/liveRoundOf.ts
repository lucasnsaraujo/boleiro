import type { Club } from "@boleiro/data/clubs";
import type { PositionGroup } from "@boleiro/engine/engine/match";
import type { Tactics } from "@boleiro/engine/sim/coach/tactics";
import { humanClubIds, waitingCoachesOf } from "@boleiro/engine/sim/coach/humanCoaches";
import { guestClubOf, guestSquadOf } from "@boleiro/engine/sim/continental/guestClubs";
import type { Fixture, IsoDate } from "@boleiro/engine/sim/gameState";
import { onPitchAt } from "@boleiro/engine/sim/live/aiSubstitutions";
import { incidentHandling, type IncidentHandling } from "@boleiro/engine/sim/live/incidentHandling";
import type { CoachMatch, LiveDay } from "@boleiro/engine/sim/live/liveDay";
import { matchRatings, type PlayerRating } from "@boleiro/engine/sim/live/matchRatings";
import type { MatchEvent } from "@boleiro/engine/sim/live/matchTimeline";
import { clubMood } from "@boleiro/engine/sim/morale/clubMood";
import { shootoutKickers } from "@boleiro/engine/sim/settleShootout";
import { fixtureLabel } from "../format/competitionName.js";
import { squadOf, type SquadPlayer } from "./matchDayPlan.js";

export type Side = "home" | "away";
export type RoundClub = Pick<Club, "id" | "shortName" | "colours" | "stadium">;

const ONCE_PLAYED = 0.5;
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
  /** Whether the screen asks the coach about his side's red cards and injuries, or something else answers them. */
  incidentHandling: IncidentHandling;
  /** Who would kick a shootout now, in order, and whether the squad overruled the coach's order to get it. */
  shootout: { kickers: string[]; isOverruled: boolean };
};

/** A human coach's side of his match in a hot-seat game, with his club and his name. */
export type HumanSide = CoachSide & { clubId: string; coachName: string };

/** A player's 0–10 mark, with his position group for the screen to show. */
export type RatedPlayer = PlayerRating & { group: PositionGroup };
/** The mark of everyone who took part in the coach's match, as it stands after its last change. */
export type MatchRatings = Record<Side, RatedPlayer[]>;

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
  /** Marks for the coach's match, drawn from its whole timeline; the screen shows them only after the final whistle. */
  ratings: MatchRatings | null;
  /** The furthest minute of the round the screen has shown; changes can only come from it on. */
  seenMinute: number;
  /** The clubs of a hot-seat game's other human coaches, whose matches show with the coach's; none in a one-coach game. */
  otherHumanClubIds?: string[];
  /** Every human coach's side in today's matches in a hot-seat game, the seated coach's first; none in a one-coach game. */
  humanSides?: HumanSide[];
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

/** A human coach's side of his open match: the owner's, or in a match between two human coaches his rival's. */
function sideOf(live: LiveDay, open: CoachMatch, clubId: string, fixture: Fixture, seenMinute: number): CoachSide | null {
  const { state } = live;
  const side: Side = fixture.homeId === clubId ? "home" : "away";
  const isOwner = (open.clubId ?? state.coachClubId) === clubId;
  const bench = (isOwner ? open.bench : open.opponentBench) ?? [];
  const tactics = isOwner ? open.tactics : open.rivalTactics;
  if (!tactics) return null;
  const events = live.matches.find((m) => m.fixtureId === open.fixtureId)?.events ?? [];
  // On the pitch once the minute's events have happened.
  const onPitch = onPitchAt(open.starters[side], bench, events, clubId, seenMinute + ONCE_PLAYED);
  const order = tactics.kickerOrder;
  const shootout = shootoutKickers({ clubId, onPitch, morale: clubMood(state, clubId).squad, ...(order ? { order } : {}) }, (p) => open.strengths[p.id] ?? p.strength);
  return {
    fixtureId: open.fixtureId,
    side,
    starters: open.starters[side].map((p) => p.id),
    benchIds: bench.map((p) => p.id),
    squad: squadOf(state, clubId, fixture, (p) => open.strengths[p.id] ?? p.strength),
    tactics,
    lastChangeMinute: open.lastChangeMinute,
    incidentHandling: incidentHandling(state, clubId),
    shootout: { kickers: shootout.kickers.map((p) => p.id), isOverruled: shootout.isOverruled },
  };
}

function coachSideOf(live: LiveDay, fixture: Fixture | undefined, seenMinute: number): CoachSide | null {
  const { state, coachMatch } = live;
  if (!coachMatch || !fixture) return null;
  return sideOf(live, coachMatch, state.coachClubId ?? "", fixture, seenMinute);
}

/** Every human coach's side today in a hot-seat game, the seated coach's first, then the waiting coaches' in turn order. */
function humanSidesOf(live: LiveDay, today: ReadonlyMap<string, Fixture>, seenMinute: number): HumanSide[] {
  const { state } = live;
  const open = [live.coachMatch, ...(live.waitingMatches ?? [])].filter((m): m is CoachMatch => m !== null);
  const coaches = [{ name: state.coachName ?? "", clubId: state.coachClubId }, ...waitingCoachesOf(state)];
  return coaches.flatMap(({ name, clubId }) => {
    if (!clubId) return [];
    const fixtureOf = (m: CoachMatch) => today.get(m.fixtureId);
    const match = open.find((m) => [fixtureOf(m)?.homeId, fixtureOf(m)?.awayId].includes(clubId));
    const fixture = match && fixtureOf(match);
    const side = match && fixture && sideOf(live, match, clubId, fixture, seenMinute);
    return side ? [{ ...side, clubId, coachName: name }] : [];
  });
}

function ratingsOf(live: LiveDay, match: RoundMatch | undefined): MatchRatings | null {
  const { coachMatch } = live;
  if (!coachMatch || !match) return null;
  const benches = [...coachMatch.bench, ...(coachMatch.opponentBench ?? [])];
  const groups = new Map([...coachMatch.starters.home, ...coachMatch.starters.away, ...benches].map((p) => [p.id, p.group]));
  const ratings = matchRatings(
    {
      home: { clubId: match.homeId, starters: coachMatch.starters.home, bench: benches },
      away: { clubId: match.awayId, starters: coachMatch.starters.away, bench: benches },
    },
    match.events,
  );
  const withGroups = (rated: readonly PlayerRating[]) => rated.map((r) => ({ ...r, group: groups.get(r.playerId) ?? "MID" }));
  return { home: withGroups(ratings.home), away: withGroups(ratings.away) };
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
      if (e.type === "goal" && e.assistId) nameOf(e.assistId);
      if (e.type === "penaltyMiss") nameOf(e.keeperId);
    }
  }
  const coach = coachSideOf(live, coachFixture, seenMinute);
  for (const p of coach?.squad ?? []) names[p.id] = p.name;
  const ratings = ratingsOf(live, matches.find((m) => m.fixtureId === live.coachMatch?.fixtureId));
  for (const r of [...(ratings?.home ?? []), ...(ratings?.away ?? [])]) nameOf(r.playerId);

  const others = humanClubIds(state).filter((id) => id !== state.coachClubId);
  if (!others.length) return { date: state.date, coachClubId: state.coachClubId, competitions, matches, clubs, names, table, coach, ratings, seenMinute };
  const humanSides = humanSidesOf(live, today, seenMinute);
  for (const p of humanSides.flatMap((side) => side.squad)) names[p.id] = p.name;
  return { date: state.date, coachClubId: state.coachClubId, competitions, matches, clubs, names, table, coach, ratings, seenMinute, otherHumanClubIds: others, humanSides };
}
