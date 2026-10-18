import type { Role } from "@boleiro/data/players";
import type { KeptMatch } from "@boleiro/engine/sim/album/album";
import type { Formation } from "@boleiro/engine/engine/formations";
import type { PositionGroup } from "@boleiro/engine/engine/match";
import { guestClubOf, guestSquadOf } from "@boleiro/engine/sim/continental/guestClubs";
import { neutralGround } from "@boleiro/engine/sim/continental/neutralGrounds";
import { matchEggNotes, type EggNote } from "@boleiro/engine/sim/eggs/findEggs";
import { attendance } from "@boleiro/engine/sim/finances/recordMatchFinances";
import type { Fixture, GameState, IsoDate, SimPlayer } from "@boleiro/engine/sim/gameState";
import type { LiveDay } from "@boleiro/engine/sim/live/liveDay";
import type { MatchPlay } from "@boleiro/engine/sim/live/matchPlay";
import { matchRatings } from "@boleiro/engine/sim/live/matchRatings";
import { hasExtraTimeIn, scorersFor, type MatchEvent } from "@boleiro/engine/sim/live/matchTimeline";
import { regenerateMatch } from "@boleiro/engine/sim/live/regenerateMatch";
import { coachKeyAt, coachNameOf } from "@boleiro/engine/sim/rivalries/coachRivalries";
import { pairKeyOf, rivalryMemoryOf } from "@boleiro/engine/sim/rivalries/rivalryMemory";
import { rivalryOf, type Rivalry } from "@boleiro/engine/sim/rivalries/rivalryOf";
import { standings } from "@boleiro/engine/sim/standings";
import { leagueMatches } from "@boleiro/engine/sim/world/resultOnlyLeague";
import { competitionKey } from "@boleiro/engine/sim/history/history";
import { competitionKeyName, competitionName, fixtureLabel } from "../format/competitionName.js";
import type { RoundClub } from "../round/liveRoundOf.js";
import { officialsOf, type Officials } from "../round/officialsOf.js";
import { curiositiesOf } from "./curiositiesOf.js";
import { compareText } from "@boleiro/engine/sim/compareText";

/** A player as the match page shows him: enough to place him on the pitch in his side's formation. */
export type PagePlayer = { id: string; name: string; group: PositionGroup; strength: number; positions?: readonly Role[] };

/** A club's place in its table before the match and after it; null when the match is not a league's or is still under way. */
export type TablePlace = { before: number; after: number | null };

export type PageSide = { club: RoundClub; formation: Formation; starters: PagePlayer[]; bench: PagePlayer[]; place: TablePlace | null };

/** The two coaches' record against each other before or after this match, when a human coach is one of them and they have met: their names, each one's wins and the draws. */
export type CoachDuel = { home: string; away: string; meetings: number; homeWins: number; awayWins: number; draws: number };

/** An earlier meeting of the two clubs this season. */
export type Meeting = { date: IsoDate; homeId: string; awayId: string; homeGoals: number; awayGoals: number };

/**
 * Everything the match page shows of one match, over its whole timeline; `matchPageAt` reads it at a
 * minute. `isLive` while the round it belongs to is under way; `isRetold` when the save kept no
 * timeline and it was told again from the fixture's seed (regenerateMatch).
 */
export type MatchPage = {
  ref: string;
  isLive: boolean;
  isRetold: boolean;
  label: string;
  /** The competition as a fan names it. */
  competition: string;
  date: IsoDate;
  home: PageSide;
  away: PageSide;
  penaltyWinnerId: string | null;
  isAfterExtraTime: boolean;
  events: MatchEvent[];
  play: MatchPlay | null;
  /** Every player's 0–10 mark over the whole timeline; the page shows them once the match is over. */
  ratings: Record<string, number>;
  names: Record<string, string>;
  venue: { stadium: string | null; crowd: number | null; gate: number | null };
  /** The referee, when the data names one for the competition, and whether VAR watches the match. */
  officials: Officials;
  meetings: Meeting[];
  curiosities: string[];
  /** The easter eggs the match laid, once it is over; a match told again shows only those the egg book wrote down. */
  eggs: EggNote[];
  /** The derby the match is, with its name and intensity; null for an ordinary match. */
  derby?: Rivalry | null;
  coachDuel?: CoachDuel | null;
};

const WORLD_REF = "world:";
// A club from abroad whose pack gives no colours shows in plain white and black.
const GUEST_COLOURS = { primary: "#FFFFFF", secondary: "#000000" };
const MEETINGS_SHOWN = 5;

/** The page reference of a match of a league played result-only: its country, its level (0 the top) and its place in the league's matches. */
export function worldMatchRef(countryId: string, level: number, index: number): string {
  return `${WORLD_REF}${countryId}:${level}:${index}`;
}

/** A match to tell: its fixture, its competition's name and label, and the fixtures its table and meetings read. */
type Located = { fixture: Fixture; competition: string; label: string; table: { clubIds: string[]; fixtures: Fixture[]; drawOrder: string[] } | null; season: Fixture[] };

function locate(state: GameState, ref: string): Located | null {
  if (ref.startsWith(WORLD_REF)) {
    const [countryId = "", level = "", index = ""] = ref.slice(WORLD_REF.length).split(":");
    const country = state.world?.[countryId];
    const league = country?.leagues[Number(level)];
    const match = league && leagueMatches(league)[Number(index)];
    if (!country || !league || !match) return null;
    const fixtures = leagueMatches(league).map((m, i): Fixture => ({ ...m, id: worldMatchRef(countryId, Number(level), i), competitionId: league.id, stage: 0 }));
    const fixture = fixtures[Number(index)];
    if (!fixture) return null;
    const name = country.structure.levels[Number(level)]?.name ?? league.id;
    const round = league.dates.indexOf(fixture.date) + 1;
    return { fixture, competition: name, label: round > 0 ? `${name} · ${round}ª rodada` : name, table: { clubIds: league.clubIds, fixtures, drawOrder: league.drawOrder }, season: fixtures };
  }
  const fixture = state.fixtures.find((f) => f.id === ref);
  const competition = fixture && state.competitions[fixture.competitionId];
  if (!fixture || !competition) return null;
  const stage = competition.stages[fixture.stage];
  // A cup abroad keeps only a human club's games of its first phase, too few for a table.
  const group = stage?.kind === "groups" && competition.kind !== "cupAbroad" ? stage.groups.find((clubs) => clubs.includes(fixture.homeId)) : undefined;
  const inGroup = new Set(group ?? []);
  const table = group
    ? { clubIds: group, fixtures: state.fixtures.filter((f) => f.competitionId === competition.id && f.stage === fixture.stage && inGroup.has(f.homeId) && inGroup.has(f.awayId)), drawOrder: competition.drawOrder }
    : null;
  return { fixture, competition: competitionName(competition), label: fixtureLabel(competition, fixture), table, season: state.fixtures };
}

function clubOf(state: GameState, clubId: string): RoundClub {
  const club = state.clubs[clubId];
  if (club) return { id: clubId, shortName: club.shortName, colours: club.colours, stadium: club.stadium };
  const guest = guestClubOf(state, clubId);
  return { id: clubId, shortName: guest?.name ?? clubId, colours: guest?.colours ?? GUEST_COLOURS, stadium: "" };
}

const pagePlayer = (p: SimPlayer): PagePlayer => ({ id: p.id, name: p.name, group: p.group, strength: p.strength, ...(p.positions ? { positions: p.positions } : {}) });

/** A side's place in its table with the matches before the match's day, and with that day's once it is played. */
function placesOf(located: Located, isOver: boolean): { home: TablePlace; away: TablePlace } | null {
  const { table, fixture } = located;
  if (!table) return null;
  const order = (until: (date: IsoDate) => boolean) => standings(table.clubIds, table.fixtures.filter((f) => f.result && until(f.date)), table.drawOrder).map((row) => row.clubId);
  const before = order((date) => date < fixture.date);
  const after = isOver ? order((date) => date <= fixture.date) : null;
  const place = (clubId: string): TablePlace => ({ before: before.indexOf(clubId) + 1, after: after ? after.indexOf(clubId) + 1 : null });
  return { home: place(fixture.homeId), away: place(fixture.awayId) };
}

function meetingsOf(located: Located): Meeting[] {
  const { fixture } = located;
  const pair = new Set([fixture.homeId, fixture.awayId]);
  return located.season
    .filter((f) => f.result && f.id !== fixture.id && f.date < fixture.date && pair.has(f.homeId) && pair.has(f.awayId))
    .toSorted((a, b) => compareText(b.date, a.date))
    .slice(0, MEETINGS_SHOWN)
    .flatMap((f) => (f.result ? [{ date: f.date, homeId: f.homeId, awayId: f.awayId, homeGoals: f.result.homeGoals, awayGoals: f.result.awayGoals }] : []));
}

/** The crowd and the gate: as booked for a human coach's home game, else what the home club draws for this game today; none on a neutral ground. */
function venueOf(state: GameState, fixture: Fixture, club: RoundClub): MatchPage["venue"] {
  const competition = state.competitions[fixture.competitionId];
  const ground = competition ? neutralGround(competition, fixture) : null;
  if (ground) return { stadium: ground, crowd: null, gate: null };
  const stadium = club.stadium || null;
  const finance = state.finances[fixture.homeId];
  if (!finance) return { stadium, crowd: null, gate: null };
  const booked = finance.homeGates?.find((g) => g.date === fixture.date && g.opponentId === fixture.awayId);
  if (booked) return { stadium, crowd: booked.crowd, gate: booked.gate };
  const crowd = attendance(state, finance, fixture.homeId, fixture.awayId, fixture);
  return { stadium, crowd, gate: Math.round(crowd * finance.ticketPrice) };
}

/** The record of the coaches on the two benches, from a human coach's rivalries as the game stands. */
function coachDuelOf(state: GameState, fixture: Fixture): CoachDuel | null {
  const home = coachKeyAt(state, fixture.homeId);
  const away = coachKeyAt(state, fixture.awayId);
  const rivalry = home && away ? rivalryMemoryOf(state).coaches[pairKeyOf(home, away)] : undefined;
  if (!home || !away || !rivalry) return null;
  const winsOf = (key: string) => (key === rivalry.a ? rivalry.aWins : rivalry.bWins);
  return { home: coachNameOf(state, home), away: coachNameOf(state, away), meetings: rivalry.meetings, homeWins: winsOf(home), awayWins: winsOf(away), draws: rivalry.draws };
}

/** Who started and who could come on, from the match's play: the starters first in the play's order. */
function sidesFromPlay(state: GameState, play: MatchPlay, homeId: string, awayId: string) {
  const byId = (id: string) => state.players[id] ?? guestPlayer(state, id);
  const starters = new Set(play.starters);
  const of = (clubId: string) => ({
    starters: play.starters.flatMap((id) => (play.players[id]?.clubId === clubId ? (byId(id) ?? []) : [])),
    bench: Object.keys(play.players).flatMap((id) => (!starters.has(id) && play.players[id]?.clubId === clubId ? (byId(id) ?? []) : [])),
  });
  return { home: of(homeId), away: of(awayId) };
}

function guestPlayer(state: GameState, playerId: string): SimPlayer | undefined {
  const clubId = playerId.slice(0, playerId.lastIndexOf("#"));
  const guest = clubId ? guestClubOf(state, clubId) : null;
  return guest ? guestSquadOf(guest).find((p) => p.id === playerId) : undefined;
}

type Story = { formations: { home: Formation; away: Formation }; starters: { home: SimPlayer[]; away: SimPlayer[] }; benches: { home: SimPlayer[]; away: SimPlayer[] }; events: MatchEvent[]; play: MatchPlay | null };

/** The match's real timeline from a live day, if the day plays it. */
function storyFromDay(day: LiveDay, fixtureId: string): Story | null {
  const match = day.matches.find((m) => m.fixtureId === fixtureId);
  if (!match) return null;
  const open = [day.coachMatch, ...(day.waitingMatches ?? [])].find((m) => m?.fixtureId === fixtureId);
  const fromPlay = match.play ? sidesFromPlay(day.state, match.play, match.homeId, match.awayId) : null;
  const starters = open?.starters ?? { home: fromPlay?.home.starters ?? [], away: fromPlay?.away.starters ?? [] };
  const benchOf = (clubId: string, side: "home" | "away") =>
    open ? [...open.bench, ...(open.opponentBench ?? [])].filter((p) => p.clubId === clubId) : (fromPlay?.[side].bench ?? []);
  return {
    formations: match.formations,
    starters,
    benches: { home: benchOf(match.homeId, "home"), away: benchOf(match.awayId, "away") },
    events: match.events,
    play: match.play ?? null,
  };
}

/** A final or a league-winning match a human coach's album kept whole after its season's fixtures went. */
function keptMatchOf(state: GameState, ref: string): KeptMatch | undefined {
  const records = [state.history.coach, ...(state.waitingCoaches ?? []).map((waiting) => waiting.record)];
  return records.flatMap((record) => record.keptMatches ?? []).find((match) => match.fixture.id === ref);
}

/** The page of a kept match, as it was played: its line-ups, timeline and marks, with nothing told again. */
function keptPage(state: GameState, kept: KeptMatch): MatchPage {
  const { fixture } = kept;
  const players = new Map(kept.players.map(([id, name, group, strength, clubId]) => [id, { player: { id, name, group, strength }, clubId }]));
  const starters = new Set(kept.starters);
  const side = (clubId: string, where: "home" | "away"): PageSide => {
    const own = [...players.values()].filter((p) => p.clubId === clubId);
    const then = kept.sides[where];
    const now = clubOf(state, clubId);
    return {
      club: state.clubs[clubId] ? now : { ...now, shortName: then.name, colours: then.colours ?? now.colours },
      formation: kept.formations[where],
      starters: kept.starters.flatMap((id) => {
        const starter = players.get(id);
        return starter?.clubId === clubId ? [starter.player] : [];
      }),
      bench: own.filter((p) => !starters.has(p.player.id)).map((p) => p.player),
      place: null,
    };
  };
  const name = competitionKeyName(competitionKey(fixture.competitionId));
  const stage = kept.kind === "final" ? (kept.firstLeg ? "final, jogo de volta" : "final") : "o jogo do título";
  return {
    ref: fixture.id,
    isLive: false,
    isRetold: false,
    label: `${name} · ${stage}`,
    competition: name,
    date: fixture.date,
    home: side(fixture.homeId, "home"),
    away: side(fixture.awayId, "away"),
    penaltyWinnerId: fixture.result.penaltyWinnerId ?? null,
    isAfterExtraTime: fixture.result.isAfterExtraTime ?? hasExtraTimeIn(kept.events),
    events: kept.events,
    play: null,
    ratings: kept.ratings,
    names: Object.fromEntries(kept.players.map(([id, playerName]) => [id, playerName])),
    venue: { stadium: kept.stadium, crowd: kept.crowd, gate: null },
    officials: { referee: kept.referee, hasVar: kept.events.some((e) => e.type === "varCheck") },
    meetings: [],
    curiosities: [],
    eggs: matchEggNotes(state, state.history, fixture, null),
    derby: rivalryOf(fixture.homeId, fixture.awayId),
    coachDuel: null,
  };
}

/**
 * The page of a match: of the live day `live` when it plays it (`isUnderWay` while its round runs),
 * else of a played match told again from its fixture's seed, or as an album kept it once its season's
 * fixtures went; null for a match not played yet.
 */
export function matchPageOf(state: GameState, ref: string, live: { day: LiveDay; isUnderWay: boolean } | null): MatchPage | null {
  const real = live ? storyFromDay(live.day, ref) : null;
  const located = locate(state, ref);
  if (!located) {
    const kept = keptMatchOf(state, ref);
    return kept ? keptPage(state, kept) : null;
  }
  const { fixture } = located;
  const { result } = fixture;
  // A real timeline is read against the game as it kicked off: its history and gate are the ones before the match.
  const before = real && live ? live.day.state : state;
  const story: Story | null = real ?? (result ? regenerateMatch(state, { ...fixture, result }) : null);
  if (!story) return null;
  const isLive = !!real && !!live?.isUnderWay;
  const home = clubOf(state, fixture.homeId);
  const away = clubOf(state, fixture.awayId);
  const names: Record<string, string> = {};
  const everyone = [...story.starters.home, ...story.starters.away, ...story.benches.home, ...story.benches.away];
  for (const p of everyone) names[p.id] = p.name;
  const rated = matchRatings(
    { home: { clubId: fixture.homeId, starters: story.starters.home, bench: story.benches.home }, away: { clubId: fixture.awayId, starters: story.starters.away, bench: story.benches.away } },
    story.events,
    story.play ?? undefined,
  );
  const ratings = Object.fromEntries([...rated.home, ...rated.away].map((r) => [r.playerId, r.rating]));
  const places = placesOf(located, !isLive && !!result);
  const venue = venueOf(before, fixture, home);
  const goals = (clubId: string) => story.events.filter((e) => e.type === "goal" && e.clubId === clubId).length;
  const score = isLive ? null : { home: goals(fixture.homeId), away: goals(fixture.awayId) };
  const curiosities = curiositiesOf({
    state: { fixtures: located.season, history: before.history, season: state.season },
    fixture,
    score,
    // While the match is played its timeline is drawn ahead of the clock: its scorers wait for the final whistle.
    scorers: real && !isLive ? [...scorersFor(story.events, fixture.homeId).map((playerId) => ({ playerId, clubId: fixture.homeId })), ...scorersFor(story.events, fixture.awayId).map((playerId) => ({ playerId, clubId: fixture.awayId }))] : null,
    crowd: venue.crowd,
    competitionName: located.competition,
    clubName: (clubId) => clubOf(state, clubId).shortName,
    playerName: (playerId) => names[playerId] ?? playerId,
  });
  const side = (club: RoundClub, where: "home" | "away"): PageSide => ({
    club,
    formation: story.formations[where],
    starters: story.starters[where].map(pagePlayer),
    bench: story.benches[where].map(pagePlayer),
    place: places?.[where] ?? null,
  });
  return {
    ref,
    isLive,
    isRetold: !real,
    label: located.label,
    competition: located.competition,
    date: fixture.date,
    home: side(home, "home"),
    away: side(away, "away"),
    penaltyWinnerId: result?.penaltyWinnerId ?? null,
    isAfterExtraTime: result?.isAfterExtraTime ?? hasExtraTimeIn(story.events),
    events: story.events,
    play: story.play,
    ratings,
    names,
    venue,
    officials: officialsOf(state, fixture),
    meetings: meetingsOf(located),
    curiosities,
    eggs: isLive || !result ? [] : matchEggNotes(state, before.history, { ...fixture, result }, real ? story : null),
    derby: rivalryOf(fixture.homeId, fixture.awayId),
    coachDuel: coachDuelOf(state, fixture),
  };
}
