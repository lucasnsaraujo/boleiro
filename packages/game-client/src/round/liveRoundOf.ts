import type { Club } from "@boleiro/data/clubs";
import type { Formation } from "@boleiro/engine/engine/formations";
import type { PositionGroup } from "@boleiro/engine/engine/match";
import { assistantOfClub, assistantReadOf } from "@boleiro/engine/sim/coach/assistant";
import { aiPosture, DEFAULT_TACTICS, type Tactics } from "@boleiro/engine/sim/coach/tactics";
import { isOnNeutralGround, neutralGround } from "@boleiro/engine/sim/continental/neutralGrounds";
import type { BoardPlayer, BoardSide, MatchMoment } from "@boleiro/engine/sim/coach/tacticsBoard";
import { humanClubIds, waitingCoachesOf } from "@boleiro/engine/sim/coach/humanCoaches";
import { planOfClub, type MatchPlan } from "@boleiro/engine/sim/coach/matchPlan";
import { guestClubOf, guestSquadOf } from "@boleiro/engine/sim/continental/guestClubs";
import type { Competition, Fixture, GameState, IsoDate, SimPlayer } from "@boleiro/engine/sim/gameState";
import { onPitchAt } from "@boleiro/engine/sim/live/aiSubstitutions";
import { incidentHandling, type IncidentHandling } from "@boleiro/engine/sim/live/incidentHandling";
import type { CoachMatch, LiveDay } from "@boleiro/engine/sim/live/liveDay";
import { playerStatsAt, type MatchPlay, type PlayerStats } from "@boleiro/engine/sim/live/matchPlay";
import { matchRatings, type PlayerRating } from "@boleiro/engine/sim/live/matchRatings";
import { HALF_TIME, type MatchEvent } from "@boleiro/engine/sim/live/matchTimeline";
import { assistantTalk, isDerbyFor, type TalkEffect, type TalkMoment, type TalkTone } from "@boleiro/engine/sim/live/teamTalk";
import { clubMood } from "@boleiro/engine/sim/morale/clubMood";
import { shootoutKickers } from "@boleiro/engine/sim/settleShootout";
import { roundDayLabel } from "../format/competitionName.js";
import { humanNationalTeamIds, nationalFixtureId, nationalTeamPlayingToday } from "@boleiro/engine/sim/nations/nationalFixtures";
import { isNationalTeam, nationalSquadOf } from "@boleiro/engine/sim/nations/nationalSquad";
import { roundClubOf } from "./roundClubOf.js";
import { aiFormationOf, recentResultsOf, squadOf, type MatchResult, type SquadPlayer } from "./matchDayPlan.js";
import { officialsOf, type Officials } from "./officialsOf.js";

export type Side = "home" | "away";
export type RoundClub = Pick<Club, "id" | "shortName" | "colours" | "stadium">;

const ONCE_PLAYED = 0.5;
/** A match of the round: its timeline and, unless it kicked off before players had one, every player's form and play; `ground` names a neutral ground, `isNeutral` marks one the game names no ground for (a national team's). */
export type RoundMatch = { fixtureId: string; competitionId: string; homeId: string; awayId: string; ground?: string; isNeutral?: true; events: MatchEvent[]; officials?: Officials; play?: MatchPlay };
/** `hasHumanCoach`: a club of a human coach plays in it, so the round shows it open; the rest go under "Outras ligas". */
type RoundCompetition = { id: string; label: string; hasHumanCoach: boolean };
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
  /** The formation the other side plays: a human rival's as of his last change, else its AI coach's. */
  rivalFormation: Formation;
  lastChangeMinute: number;
  /** Whether the screen asks the coach about his side's red cards and injuries, or something else answers them; "matchPlan" when the house rule leaves the match to the plans. */
  incidentHandling: IncidentHandling;
  /** His side's red cards and injuries his match plan answered, so their windows stay shut; none when it answered nothing. */
  answeredByPlan?: { minute: number; playerId: string }[];
  /** What the round needs of his match plan: his two keys, the tactics they cycle through, and whether he is asked his shootout order; left out, an empty plan. */
  plan?: LivePlan;
  /** Who would kick a shootout now, in order, and whether the squad overruled the coach's order to get it. */
  shootout: { kickers: string[]; isOverruled: boolean };
  /** Who the opponent may field, to read its side at any minute for the tactics board (tacticsViewAt). */
  opponent: OpponentRoster;
  /** Each squad player's strength today as the coach's assistant reads it, off by up to his level's error; his substitutions go by it. */
  assistantReads?: Record<string, number>;
  /** The half-time talk: where the side stands at the break, the assistant's tone for it, and the talk the coach gave with what it did. */
  halfTimeTalk: { moment: TalkMoment; suggested: TalkTone; given: (TalkEffect & { tone: TalkTone }) | null };
};

/** A coach's match plan as the live round uses it. */
export type LivePlan = { tacticsKey?: string; timeOutKey?: string; savedTactics: Tactics[]; asksBeforeShootout: boolean };

function livePlanOf(plan: MatchPlan | undefined): LivePlan {
  return {
    ...(plan?.tacticsKey ? { tacticsKey: plan.tacticsKey } : {}),
    ...(plan?.timeOutKey ? { timeOutKey: plan.timeOutKey } : {}),
    savedTactics: plan?.savedTactics ?? [],
    asksBeforeShootout: plan?.asksBeforeShootout === true,
  };
}

/** The opponent of a coach's match: its starters and bench at today's strength, its formation, its coach's tactics when he is human, and its last five results before today. */
export type OpponentRoster = { clubId: string; name: string; starters: BoardPlayer[]; bench: BoardPlayer[]; formation: Formation; rivalTactics: Tactics | null; form: MatchResult[] };

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

/** A national team's group as the live table reads it: every match of the group, from the national competition, today's still unplayed. */
function nationalGroupTable(state: GameState, competition: Extract<Competition, { kind: "national" }>, fixture: Fixture): RoundTable | null {
  const nations = state.nations;
  const own = nations?.matches.find((m) => nationalFixtureId(m.id) === fixture.id);
  const clubIds = own?.group ? nations?.competitions[competition.nationalId]?.groups[own.group] : undefined;
  if (!nations || !own?.group || !clubIds || own.round !== "group") return null;
  const fixtures = nations.matches.flatMap((m): Fixture[] =>
    m.competitionId === own.competitionId && m.round === "group" && m.group === own.group
      ? [{ id: nationalFixtureId(m.id), competitionId: competition.id, stage: fixture.stage, date: m.date, homeId: m.homeId, awayId: m.awayId, result: m.result ? { homeGoals: m.result.home, awayGoals: m.result.away } : null }]
      : [],
  );
  return { clubIds, fixtures, drawOrder: [] };
}

function tableOf(live: LiveDay, fixture: Fixture | undefined): RoundTable | null {
  if (!fixture) return null;
  const { state } = live;
  const competition = state.competitions[fixture.competitionId];
  if (competition?.kind === "national") return competition.nationalKind === "friendlies" ? null : nationalGroupTable(state, competition, fixture);
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
  const match = live.matches.find((m) => m.fixtureId === open.fixtureId);
  const events = match?.events ?? [];
  // On the pitch once the minute's events have happened.
  const onPitch = onPitchAt(open.starters[side], bench, events, clubId, seenMinute + ONCE_PLAYED);
  const otherSide: Side = side === "home" ? "away" : "home";
  const opponentId = side === "home" ? fixture.awayId : fixture.homeId;
  const boardPlayer = (p: SimPlayer): BoardPlayer => ({ id: p.id, name: p.name, group: p.group, ...(p.positions ? { positions: p.positions } : {}), strength: open.strengths[p.id] ?? p.strength });
  const opponent: OpponentRoster = {
    clubId: opponentId,
    name: roundClubOf(state, opponentId)?.shortName ?? opponentId,
    starters: open.starters[otherSide].map(boardPlayer),
    bench: ((isOwner ? open.opponentBench : open.bench) ?? []).map(boardPlayer),
    formation: match?.formations[otherSide] ?? DEFAULT_TACTICS.formation,
    rivalTactics: (isOwner ? open.rivalTactics : open.tactics) ?? null,
    form: recentResultsOf(state.fixtures, opponentId),
  };
  const goalsAtBreak = (isOwn: boolean) => events.filter((e) => e.type === "goal" && e.minute <= HALF_TIME && (e.clubId === clubId) === isOwn).length;
  const talkMoment: TalkMoment = { lead: goalsAtBreak(true) - goalsAtBreak(false), morale: clubMood(state, clubId).squad, isDerby: isDerbyFor(state, fixture, clubId) };
  const order = tactics.kickerOrder;
  const shootout = shootoutKickers({ clubId, onPitch, morale: clubMood(state, clubId).squad, ...(order ? { order } : {}) }, (p) => open.strengths[p.id] ?? p.strength);
  const squad = squadOf(state, clubId, fixture, (p) => open.strengths[p.id] ?? p.strength);
  const read = assistantReadOf(state, assistantOfClub(state, clubId));
  return {
    fixtureId: open.fixtureId,
    side,
    starters: open.starters[side].map((p) => p.id),
    benchIds: bench.map((p) => p.id),
    squad,
    assistantReads: Object.fromEntries(squad.map((p) => [p.id, read(p.id, p.strength)])),
    tactics,
    rivalFormation: (isOwner ? open.rivalTactics : open.tactics)?.formation ?? aiFormationOf(state, side === "home" ? fixture.awayId : fixture.homeId),
    lastChangeMinute: open.lastChangeMinute,
    incidentHandling: incidentHandling(state, clubId, fixture),
    answeredByPlan: (open.answeredByPlan ?? []).flatMap((answer) => (answer.clubId === clubId ? [{ minute: answer.minute, playerId: answer.playerId }] : [])),
    plan: livePlanOf(planOfClub(state, clubId)),
    shootout: { kickers: shootout.kickers.map((p) => p.id), isOverruled: shootout.isOverruled },
    opponent,
    halfTimeTalk: { moment: talkMoment, suggested: assistantTalk(talkMoment), given: open.halfTimeTalks?.[clubId] ?? null },
  };
}

/**
 * A coach's live match as the tactics board reads it at `minute`: the opponent's eleven then, after
 * its substitutions and less anyone sent off, its tactics (an AI coach's posture follows the score and
 * the clock, as in the match), and the coach's lead.
 */
export function tacticsViewAt(round: Pick<LiveRound, "matches">, side: CoachSide, minute: number): { opponent: BoardSide; moment: MatchMoment } {
  const { opponent } = side;
  const events = (round.matches.find((m) => m.fixtureId === side.fixtureId)?.events ?? []).filter((e) => e.minute <= minute);
  const byId = new Map([...opponent.starters, ...opponent.bench].map((p) => [p.id, p]));
  let eleven = [...opponent.starters];
  for (const event of events) {
    if (event.type === "substitution" && event.clubId === opponent.clubId) eleven = eleven.map((p) => (p.id === event.offId ? (byId.get(event.playerId) ?? p) : p));
    if (event.type === "card" && event.card !== "yellow" && event.clubId === opponent.clubId) eleven = eleven.filter((p) => p.id !== event.playerId);
  }
  const theirGoals = events.filter((e) => e.type === "goal" && e.clubId === opponent.clubId).length;
  const lead = events.filter((e) => e.type === "goal").length - 2 * theirGoals;
  const tactics = opponent.rivalTactics ?? { ...DEFAULT_TACTICS, formation: opponent.formation, posture: aiPosture(-lead, minute) };
  return { opponent: { name: opponent.name, eleven, tactics }, moment: { isHome: side.side === "home", minute, lead } };
}

function coachSideOf(live: LiveDay, fixture: Fixture | undefined, seenMinute: number): CoachSide | null {
  const { state, coachMatch } = live;
  if (!coachMatch || !fixture) return null;
  return sideOf(live, coachMatch, coachMatch.clubId ?? state.coachClubId ?? "", fixture, seenMinute);
}

/**
 * Every human side today when there is more than one: a hot-seat game's coaches, the seated coach's first, then
 * the waiting coaches' in turn order; and a coach's national team beside his club on a day both play.
 */
function humanSidesOf(live: LiveDay, today: ReadonlyMap<string, Fixture>, seenMinute: number): HumanSide[] {
  const { state } = live;
  const open = [live.coachMatch, ...(live.waitingMatches ?? [])].filter((m): m is CoachMatch => m !== null);
  const nationalOf = (teamId: string | undefined) => nationalTeamPlayingToday(state, teamId);
  const sidesOf = (name: string, clubId: string | null, teamId: string | undefined) => [{ name, clubId }, ...(nationalOf(teamId) ? [{ name, clubId: nationalOf(teamId) }] : [])];
  const coaches = [...sidesOf(state.coachName ?? "", state.coachClubId, state.nations?.job?.teamId), ...waitingCoachesOf(state).flatMap((w) => sidesOf(w.name, w.clubId, w.nationalJob?.teamId))];
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
    match.play,
  );
  const withGroups = (rated: readonly PlayerRating[]) => rated.map((r) => ({ ...r, group: groups.get(r.playerId) ?? "MID" }));
  return { home: withGroups(ratings.home), away: withGroups(ratings.away) };
}

/** What each player who has been on the pitch did in a match up to `minute`, with his form of the day; nobody in a match without a play. */
export function playerStatsOf(match: RoundMatch, minute: number): Record<string, PlayerStats> {
  return match.play ? playerStatsAt(match.play, match.events, minute) : {};
}

/** The live round screen's view of a live day. */
export function liveRoundOf(live: LiveDay, seenMinute: number): LiveRound {
  const { state } = live;
  const today = new Map(state.fixtures.filter((f) => f.date === state.date).map((f) => [f.id, f]));
  const coachFixture = live.coachMatch ? today.get(live.coachMatch.fixtureId) : undefined;
  const matches: RoundMatch[] = live.matches.map((m) => {
    const fixture = today.get(m.fixtureId);
    const competition = fixture && state.competitions[fixture.competitionId];
    const ground = fixture && competition ? neutralGround(competition, fixture) : null;
    const isNeutral = !ground && competition?.kind === "national" && fixture !== undefined && isOnNeutralGround(competition, fixture.stage);
    return {
      fixtureId: m.fixtureId,
      competitionId: fixture?.competitionId ?? "",
      homeId: m.homeId,
      awayId: m.awayId,
      ...(ground ? { ground } : {}),
      ...(isNeutral ? { isNeutral: true as const } : {}),
      events: m.events,
      officials: officialsOf(state, fixture),
      ...(m.play ? { play: m.play } : {}),
    };
  });

  const counts = new Map<string, number>();
  for (const m of matches) counts.set(m.competitionId, (counts.get(m.competitionId) ?? 0) + 1);
  const isCoachs = (id: string) => id === coachFixture?.competitionId;
  const nationalToday = humanNationalTeamIds(state).filter((teamId) => nationalTeamPlayingToday(state, teamId) !== null);
  const humans = [...humanClubIds(state), ...nationalToday];
  const competitions = [...counts.keys()]
    .sort((a, b) => Number(isCoachs(b)) - Number(isCoachs(a)) || (counts.get(b) ?? 0) - (counts.get(a) ?? 0))
    .flatMap((id) => {
      const competition = state.competitions[id];
      const first = matches.find((m) => m.competitionId === id);
      const fixture = first && today.get(first.fixtureId);
      // A club can reach a cup from another one (Libertadores to Sul-Americana) without being in its entry list, so today's matches count too.
      const isHumanToday = matches.some((m) => m.competitionId === id && (humans.includes(m.homeId) || humans.includes(m.awayId)));
      const hasHumanCoach = isHumanToday || (competition?.clubIds.some((clubId) => humans.includes(clubId)) ?? false);
      // A national competition's day is headed by the coach's own match when he plays in it.
      const shown = coachFixture?.competitionId === id ? coachFixture : fixture;
      return competition && shown ? [{ id, label: roundDayLabel(competition, shown), hasHumanCoach }] : [];
    });

  const table = tableOf(live, coachFixture);
  const clubs: Record<string, RoundClub> = {};
  for (const id of [...matches.flatMap((m) => [m.homeId, m.awayId]), ...(table?.clubIds ?? [])]) {
    const club = roundClubOf(state, id);
    if (club) clubs[id] = club;
  }
  // Players who are none of the game's: a continental guest's, and a national team's from abroad.
  const guestPlayers = new Map(matches.flatMap((m) => [m.homeId, m.awayId]).flatMap((id) => {
    const guest = guestClubOf(state, id);
    if (guest) return guestSquadOf(guest).map((p) => [p.id, p.name] as const);
    return isNationalTeam(state, id) ? nationalSquadOf(state, id).map((p) => [p.id, p.name] as const) : [];
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

  // The coach's side today is his national team on its match day when his club doesn't play.
  const coachClubId = live.coachMatch?.clubId ?? state.coachClubId;
  const others = humans.filter((id) => id !== coachClubId && id !== state.coachClubId);
  if (!others.length) return { date: state.date, coachClubId, competitions, matches, clubs, names, table, coach, ratings, seenMinute };
  const humanSides = humanSidesOf(live, today, seenMinute);
  for (const p of humanSides.flatMap((side) => side.squad)) names[p.id] = p.name;
  return { date: state.date, coachClubId, competitions, matches, clubs, names, table, coach, ratings, seenMinute, otherHumanClubIds: others, humanSides };
}
