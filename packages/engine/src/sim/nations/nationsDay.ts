import { CALIBRATED, simulateExtraTime, simulateMatch, type EngineParams } from "../../engine/match.js";
import { keyedStream, randomStream } from "../../engine/random.js";
import { addDays, daysBetween } from "../dates.js";
import type { GameState, IsoDate, SimPlayer } from "../gameState.js";
import { fatigueOn } from "../players/fatigueOn.js";
import { drawMatchInjuries, type PlayerInjured } from "../players/recordMatchLoad.js";
import { withReplacedPlayers } from "../players/squadsByClub.js";
import { nationalSide, splitRefs } from "./callUps.js";
import { callUpRefsOf, nationalJobsAfter, withLiveOffer, type NationalJobEvent } from "./nationalJobs.js";
import { fifaWindowsOf, type FifaWindow } from "./fifaCalendar.js";
import { matchImportance, rankingPointsAfter } from "./fifaRanking.js";
import { competitionsOf, groupTable } from "./nationalCompetitions.js";
import type { CallUp, KnockoutRound, NationalCompetition, NationalMatch, NationalResult, Nations } from "./nations.js";

export type CalledUp = { type: "calledUp"; playerId: string; clubId: string; teamId: string; until: IsoDate };
export type BackFromDuty = { type: "backFromDuty"; playerId: string; clubId: string; teamId: string };
export type NationalTitleWon = { type: "nationalTitle"; competitionId: string; name: string; winnerId: string; runnerUpId?: string };
export type NationsEvent = CalledUp | BackFromDuty | NationalTitleWon | PlayerInjured | NationalJobEvent;

const NEUTRAL: EngineParams = { ...CALIBRATED, homeAdvantage: 0 };
// guess: a team in a final tournament starting this soon after a window keeps its players from the window on.
export const TOURNAMENT_CAMP_DAYS = 20;
// guess: a team knocked out sends its players home; they are back at their clubs two days after its last match.
const DAYS_HOME = 2;
const MATCH_LOAD = 100;
const INJURY_STREAM_SALT = 0x1a7105;
const FINAL_TOURNAMENTS = new Set(["world-cup", "continental-cup"]);
const TITLE_KINDS = new Set(["world-cup", "continental-cup", "nations-league"]);

const windowsBySeason = new Map<number, FifaWindow[]>();
function windowsOf(season: number): FifaWindow[] {
  let windows = windowsBySeason.get(season);
  if (!windows) windowsBySeason.set(season, (windows = fifaWindowsOf(season)));
  return windows;
}

/** The game's players away with a national team on `date`. */
export function onDutyOn(state: Pick<GameState, "nations">, date: IsoDate): ReadonlySet<string> {
  const away = new Set<string>();
  const duty = state.nations?.duty;
  if (!duty) return away;
  for (const id in duty) if ((duty[id]?.until ?? "") >= date) away.add(id);
  return away;
}

/** The winner of a decided knockout match: on the score, else on penalties. */
function winnerOf(match: NationalMatch): string | null {
  const { result } = match;
  if (!result) return null;
  if (result.home !== result.away) return result.home > result.away ? match.homeId : match.awayId;
  return result.penaltyWinnerId ?? null;
}

/** Each tie of a knockout round, decided or not: its two teams and its winner and loser once played. */
function tiesOf(round: KnockoutRound, matches: readonly NationalMatch[]): { teams: [string, string]; winner: string | null; loser: string | null }[] {
  const firsts = matches.filter((m) => m.leg !== 2);
  return firsts.map((first) => {
    const teams: [string, string] = [first.homeId, first.awayId];
    const decider = round.legs === 2 ? matches.find((m) => m.leg === 2 && m.homeId === first.awayId && m.awayId === first.homeId) : first;
    if (!decider?.result || (round.legs === 2 && !first.result)) return { teams, winner: null, loser: null };
    let winner: string | null;
    if (round.legs === 2 && first.result) {
      const homeTotal = first.result.home + decider.result.away;
      const awayTotal = first.result.away + decider.result.home;
      winner = homeTotal !== awayTotal ? (homeTotal > awayTotal ? first.homeId : first.awayId) : (decider.result.penaltyWinnerId ?? null);
    } else winner = winnerOf(decider);
    return { teams, winner, loser: winner ? (teams[0] === winner ? teams[1] : teams[0]) : null };
  });
}

/** Seeding order of a bracket of `size` so that seeds 1 and 2 meet only in the final: [1, size, …]. */
function bracketOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const next = order.length * 2 + 1;
    order = order.flatMap((seed) => [seed, next - seed]);
  }
  return order;
}

/**
 * A knockout's first round from its seeds in order: the bracket's pairs (seed 1 against the last), the second
 * team of a pair from the first's group swapped with another pair's second team when that clears both.
 */
export function firstRoundPairs(seeds: readonly string[], groupOf: (id: string) => string): [string, string][] {
  const order = bracketOrder(seeds.length);
  const pairs: [string, string][] = [];
  for (let i = 0; i + 1 < order.length; i += 2) pairs.push([seeds[(order[i] ?? 1) - 1] ?? "", seeds[(order[i + 1] ?? 1) - 1] ?? ""]);
  const clashes = (home: string, away: string) => groupOf(home) === groupOf(away);
  pairs.forEach((pair, i) => {
    if (!clashes(...pair)) return;
    const other = pairs.findIndex((candidate, j) => j !== i && !clashes(pair[0], candidate[1]) && !clashes(candidate[0], pair[1]));
    const swap = pairs[other];
    if (!swap) return;
    [pair[1], swap[1]] = [swap[1], pair[1]];
  });
  return pairs;
}

/** The teams through a competition's groups in seeding order: each place's teams best first, then the best of the next place. */
function groupQualifiers(competition: NationalCompetition, matches: readonly NationalMatch[], points: (id: string) => number): string[] {
  const own = matches.filter((m) => m.competitionId === competition.id && m.round === "group");
  const stats = new Map<string, { pts: number; gd: number; gf: number }>();
  for (const m of own) {
    if (!m.result) continue;
    for (const [id, f, a] of [[m.homeId, m.result.home, m.result.away], [m.awayId, m.result.away, m.result.home]] as const) {
      const row = stats.get(id) ?? { pts: 0, gd: 0, gf: 0 };
      stats.set(id, { pts: row.pts + (f > a ? 3 : f === a ? 1 : 0), gd: row.gd + f - a, gf: row.gf + f });
    }
  }
  const row = (id: string) => stats.get(id) ?? { pts: 0, gd: 0, gf: 0 };
  const best = (a: string, b: string) => row(b).pts - row(a).pts || row(b).gd - row(a).gd || row(b).gf - row(a).gf || points(b) - points(a);
  const tables = Object.values(competition.groups).map((ids) => groupTable(ids, own, points));
  const through: string[] = [];
  for (let place = 0; place < competition.places; place++) through.push(...tables.flatMap((table) => table.slice(place, place + 1)).sort(best));
  if (competition.bestOf) {
    const { position, count } = competition.bestOf;
    through.push(...tables.flatMap((table) => table.slice(position - 1, position)).sort(best).slice(0, count));
  }
  return through;
}

/**
 * A knockout round's matches between `pairs`, its days in order, two legs when it plays them. A day already
 * played (the real schedule's days are UTC, so a round can start the day its groups end) moves to tomorrow.
 */
function roundMatches(competition: NationalCompetition, round: KnockoutRound, pairs: readonly [string, string][], today: IsoDate): NationalMatch[] {
  const isNeutral = FINAL_TOURNAMENTS.has(competition.kind) || (competition.kind === "nations-league" && round.legs === 1);
  const after = (date: IsoDate) => (date > today ? date : addDays(today, 1));
  return pairs.flatMap(([homeId, awayId], tie): NationalMatch[] => {
    const id = `${competition.id}-${round.name}-${tie + 1}`;
    const date = after(round.dates[round.legs === 2 ? 0 : tie % round.dates.length] ?? competition.until);
    const first: NationalMatch = { id, competitionId: competition.id, round: round.name, date, homeId, awayId, ...(isNeutral ? { isNeutral: true as const } : {}), result: null };
    if (round.legs === 1) return [first];
    return [first, { id: `${id}-2`, competitionId: competition.id, round: round.name, leg: 2, date: after(round.dates[1] ?? date), homeId: awayId, awayId: homeId, result: null }];
  });
}

/** Opens a competition's rounds that are due: the first once its groups are played, a later one once the round it takes from is decided; finishes it after its last. */
function progress(nations: Nations, competition: NationalCompetition, today: IsoDate): { competition: NationalCompetition; matches: NationalMatch[]; title: NationalTitleWon | null } {
  const points = (id: string) => nations.teams[id]?.points ?? 0;
  const own = nations.matches.filter((m) => m.competitionId === competition.id);
  let current = competition;
  const added: NationalMatch[] = [];
  if (current.winnerId || !own.length || own.some((m) => m.round === "group" && !m.result)) return { competition, matches: [], title: null };
  if (!current.knockout.length) {
    if (own.some((m) => !m.result)) return { competition, matches: [], title: null };
    const table = groupTable(Object.values(current.groups)[0] ?? [], own, points);
    return { competition: { ...current, winnerId: table[0] ?? "" }, matches: [], title: null };
  }
  while (current.opened < current.knockout.length) {
    const index = current.opened;
    const round = current.knockout[index] as KnockoutRound;
    let pairs: [string, string][];
    if (index === 0) {
      const groups = new Map(Object.entries(current.groups).flatMap(([group, ids]) => ids.map((id) => [id, group] as const)));
      pairs = firstRoundPairs(groupQualifiers(current, own, points), (id) => groups.get(id) ?? id);
    } else {
      const fromIndex = round.from ?? index - 1;
      const from = current.knockout[fromIndex] as KnockoutRound;
      const ties = tiesOf(from, [...own, ...added].filter((m) => m.round === from.name));
      if (ties.some((tie) => !tie.winner)) break;
      const teams = ties.map((tie) => (round.takes === "losers" ? tie.loser : tie.winner) ?? "");
      pairs = [];
      for (let i = 0; i + 1 < teams.length; i += 2) pairs.push([teams[i] ?? "", teams[i + 1] ?? ""]);
    }
    added.push(...roundMatches(current, round, pairs, today));
    current = { ...current, opened: index + 1 };
  }
  const final = current.knockout.at(-1);
  if (current.opened === current.knockout.length && final) {
    const ties = tiesOf(final, [...own, ...added].filter((m) => m.round === final.name));
    const decided = ties[0];
    if (ties.length === 1 && decided?.winner) {
      const title: NationalTitleWon = { type: "nationalTitle", competitionId: current.id, name: current.name, winnerId: decided.winner, ...(decided.loser ? { runnerUpId: decided.loser } : {}) };
      return { competition: { ...current, winnerId: decided.winner }, matches: added, title: TITLE_KINDS.has(current.kind) ? title : null };
    }
  }
  return { competition: current, matches: added, title: null };
}

/** The teams still in a final tournament: any with a match to play, or through to a round not drawn yet. */
function stillIn(competition: NationalCompetition, matches: readonly NationalMatch[]): Set<string> {
  const alive = new Set<string>();
  if (competition.winnerId) return alive;
  const own = matches.filter((m) => m.competitionId === competition.id);
  if (competition.opened === 0) return new Set(Object.values(competition.groups).flat());
  for (const m of own) if (!m.result) alive.add(m.homeId).add(m.awayId);
  competition.knockout.slice(0, competition.opened).forEach((round, index) => {
    const later = competition.knockout.slice(competition.opened).filter((other, i) => (other.from ?? competition.opened + i - 1) === index);
    if (!later.length) return;
    for (const tie of tiesOf(round, own.filter((m) => m.round === round.name))) {
      if (later.some((other) => other.takes === "winners") && tie.winner) alive.add(tie.winner);
      if (later.some((other) => other.takes === "losers") && tie.loser) alive.add(tie.loser);
    }
  });
  return alive;
}

/** A match drawn result-only from both sides' best elevens; a knockout match level after ninety minutes goes to extra time and an even shootout. */
function playMatch(nations: Nations, match: NationalMatch, players: Readonly<Record<string, SimPlayer>>, random: () => number) {
  const home = nationalSide(nations, match.homeId, players, match.date);
  const away = nationalSide(nations, match.awayId, players, match.date);
  const params = match.isNeutral ? NEUTRAL : CALIBRATED;
  const ninety = simulateMatch(home.team, away.team, random, params);
  let result: NationalResult = { home: ninety.homeGoals, away: ninety.awayGoals };
  const competition = nations.competitions[match.competitionId];
  const round = competition?.knockout.find((r) => r.name === match.round);
  const first = round?.legs === 2 && match.leg === 2 ? nations.matches.find((m) => m.competitionId === match.competitionId && m.round === match.round && m.leg !== 2 && m.homeId === match.awayId) : undefined;
  const isLevel = (score: { home: number; away: number }) => (first?.result ? first.result.home + score.away === first.result.away + score.home : score.home === score.away);
  if (round && (round.legs === 1 || match.leg === 2) && isLevel(result)) {
    const extra = simulateExtraTime(home.team, away.team, random, params);
    result = { home: result.home + extra.homeGoals, away: result.away + extra.awayGoals, isAfterExtraTime: true };
    if (isLevel(result)) result = { ...result, penaltyWinnerId: random() < 0.5 ? match.homeId : match.awayId };
  }
  return { result, fielded: [...home.fielded, ...away.fielded] };
}

/**
 * The friendlies of a window: on each of its match days every team without a match that day meets the closest
 * free team in confederation and points it hasn't met in the window yet.
 */
function windowFriendlies(nations: Nations, window: FifaWindow, random: () => number): NationalMatch[] {
  const season = Number(window.from.slice(0, 4));
  const order = Object.values(nations.teams).sort((a, b) => a.confederation.localeCompare(b.confederation) || b.points - a.points || a.id.localeCompare(b.id));
  const met = new Set<string>();
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  return window.matchDays.flatMap((date) => {
    const busy = new Set(nations.matches.filter((m) => Math.abs(daysBetween(m.date, date)) <= 1).flatMap((m) => [m.homeId, m.awayId]));
    const free = order.filter((t) => !busy.has(t.id)).map((t) => t.id);
    const paired = new Set<string>();
    const pairs: NationalMatch[] = [];
    free.forEach((team, i) => {
      if (paired.has(team)) return;
      const rival = free.slice(i + 1).find((other) => !paired.has(other) && !met.has(pairKey(team, other)));
      if (!rival) return;
      paired.add(team).add(rival);
      met.add(pairKey(team, rival));
      const [homeId, awayId] = random() < 0.5 ? [team, rival] : [rival, team];
      pairs.push({ id: `friendly-${date}-${homeId}`, competitionId: `friendlies-${season}`, round: "friendly", date, homeId, awayId, result: null });
    });
    return pairs;
  });
}

/** The game's players a team calls up on `date` and its pool's others, away until `until`: the game's coach's own picks for his team. */
function callUp(state: GameState, nations: Nations, teamId: string, date: IsoDate, until: IsoDate): CallUp {
  return { teamId, ...splitRefs(callUpRefsOf(state, nations, teamId, date)), from: date, until };
}

/** The final tournament a team goes to from this window, if one starts soon after it. */
function tournamentAfter(nations: Nations, teamId: string, window: FifaWindow): NationalCompetition | undefined {
  return Object.values(nations.competitions).find((c) => {
    if (!FINAL_TOURNAMENTS.has(c.kind) || c.winnerId || !Object.values(c.groups).some((ids) => ids.includes(teamId))) return false;
    const start = nations.matches.filter((m) => m.competitionId === c.id).map((m) => m.date).sort()[0];
    return start !== undefined && start >= window.from && daysBetween(window.until, start) <= TOURNAMENT_CAMP_DAYS;
  });
}

/**
 * National football's part of a day, after the clubs': `today`'s national matches drawn result-only (the
 * game's players among each side's eleven take its fatigue and may get hurt, as in a club match), knockout
 * rounds drawn and titles won, teams knocked out of a tournament sending their players home, the ranking
 * moved; players whose duty ended back at their clubs; on 1 January the season's competitions; and on the eve
 * of a FIFA window its friendlies and every team's call-up.
 */
export function nationsDay(state: GameState, today: IsoDate): { state: GameState; events: NationsEvent[] } {
  if (!state.nations) return { state, events: [] };
  const events: NationsEvent[] = [];
  const random = randomStream(state.nations.rngState);
  let nations: Nations = state.nations;
  let players = state.players;

  const todays = nations.matches.filter((m) => m.date === today && !m.result);
  const uncalled = [...new Set(todays.flatMap((m) => [m.homeId, m.awayId]))].filter((id) => !nations.callUps[id]);
  if (uncalled.length) {
    // A save opened mid-window has teams to play without a call-up: their coaches pick on the day.
    nations = { ...nations, callUps: { ...nations.callUps, ...Object.fromEntries(uncalled.map((id) => [id, callUp(state, nations, id, today, today)])) } };
  }
  if (todays.length) {
    const changed = new Map<string, SimPlayer>();
    const played = new Map<string, NationalMatch>();
    const teams = { ...nations.teams };
    for (const match of todays) {
      const { result, fielded } = playMatch({ ...nations, matches: nations.matches.map((m) => played.get(m.id) ?? m) }, match, players, random.next);
      played.set(match.id, { ...match, result });
      const injuries = drawMatchInjuries(fielded, { date: today, pitch: "natural" }, random.next, (id) => keyedStream(state.seed ^ INJURY_STREAM_SALT, `${match.id}:${id}`));
      for (const player of fielded) {
        const injury = injuries.get(player.id);
        const hurtUntil = injury ? addDays(today, injury.days) : undefined;
        const lastInjury = player.condition.injuredUntil;
        const fitOn = hurtUntil && (!lastInjury || hurtUntil > lastInjury) ? hurtUntil : lastInjury;
        if (injury && fitOn) events.push({ type: "playerInjured", playerId: player.id, clubId: player.clubId, days: injury.days, fitOn, kind: injury.kind });
        changed.set(player.id, { ...player, condition: { ...player.condition, fatigue: fatigueOn(player, today) + MATCH_LOAD, fatigueOn: today, injuredUntil: fitOn, ...(injury ? { injury: injury.kind } : {}) } });
      }
      const competition = nations.competitions[match.competitionId];
      const home = teams[match.homeId];
      const away = teams[match.awayId];
      if (home && away) {
        const importance = matchImportance(competition?.kind ?? "friendlies", match.round === "friendly" ? "friendly" : match.round);
        const isKnockout = FINAL_TOURNAMENTS.has(competition?.kind ?? "") && match.round !== "group";
        const penaltyWinner = result.penaltyWinnerId ? (result.penaltyWinnerId === match.homeId ? ("home" as const) : ("away" as const)) : undefined;
        const after = rankingPointsAfter({ home: home.points, away: away.points }, { home: result.home, away: result.away, ...(penaltyWinner ? { penaltyWinner } : {}) }, importance, isKnockout);
        teams[home.id] = { ...home, points: after.home };
        teams[away.id] = { ...away, points: after.away };
      }
    }
    players = changed.size ? withReplacedPlayers(players, [...changed.values()]) : players;
    nations = { ...nations, teams, matches: nations.matches.map((m) => played.get(m.id) ?? m) };

    const competitions = { ...nations.competitions };
    let matches = nations.matches;
    for (const id of new Set(todays.map((m) => m.competitionId))) {
      const competition = competitions[id];
      if (!competition) continue;
      const moved = progress({ ...nations, matches }, competition, today);
      competitions[id] = moved.competition;
      matches = [...matches, ...moved.matches];
      if (moved.title) {
        events.push(moved.title);
        nations = { ...nations, titles: [...nations.titles, { competitionId: id, name: competition.name, season: Number(today.slice(0, 4)), winnerId: moved.title.winnerId, ...(moved.title.runnerUpId ? { runnerUpId: moved.title.runnerUpId } : {}) }] };
      }
    }
    nations = { ...nations, competitions, matches };

    // A team out of a final tournament sends its players home.
    const callUps = { ...nations.callUps };
    const duty = { ...nations.duty };
    const home = addDays(today, DAYS_HOME);
    for (const competition of Object.values(competitions).filter((c) => FINAL_TOURNAMENTS.has(c.kind) && todays.some((m) => m.competitionId === c.id))) {
      const alive = stillIn(competition, matches);
      for (const teamId of Object.values(competition.groups).flat()) {
        const own = callUps[teamId];
        if (alive.has(teamId) || !own || own.until <= home) continue;
        callUps[teamId] = { ...own, until: home };
        for (const id of own.playerIds) if (duty[id]) duty[id] = { teamId, until: home };
      }
    }
    nations = { ...nations, callUps, duty };
  }

  // Back at the club the day after the last day away.
  const back = Object.entries(nations.duty).filter(([, own]) => own.until < state.date);
  if (back.length) {
    const duty = Object.fromEntries(Object.entries(nations.duty).filter(([, own]) => own.until >= state.date));
    for (const [id, own] of back) {
      const player = players[id];
      if (player) events.push({ type: "backFromDuty", playerId: id, clubId: player.clubId, teamId: own.teamId });
    }
    nations = { ...nations, duty, callUps: Object.fromEntries(Object.entries(nations.callUps).filter(([, own]) => own.until >= state.date)) };
  }

  const season = Number(state.date.slice(0, 4));
  if (state.date.endsWith("-01-01")) {
    const opened = competitionsOf(season, nations, random.next);
    const finished = new Set(Object.values(nations.competitions).filter((c) => c.winnerId || c.until < state.date).map((c) => c.id));
    const competitions = Object.fromEntries([...Object.entries(nations.competitions).filter(([id]) => !finished.has(id)), ...opened.competitions.map((c) => [c.id, c] as const)]);
    nations = { ...nations, competitions, matches: [...nations.matches.filter((m) => !finished.has(m.competitionId)), ...opened.matches] };
  }

  const window = windowsOf(season).find((w) => w.from === state.date);
  if (window) {
    const friendlies = windowFriendlies(nations, window, random.next);
    const friendlyId = `friendlies-${season}`;
    const competitions = friendlyId in nations.competitions ? nations.competitions : { ...nations.competitions, [friendlyId]: { id: friendlyId, name: `Amistosos ${season}`, kind: "friendlies" as const, groups: {}, places: 0, knockout: [], opened: 0, until: `${season}-12-31`, winnerId: "" } };
    nations = { ...nations, competitions, matches: [...nations.matches, ...friendlies] };
    const callUps = { ...nations.callUps };
    const duty = { ...nations.duty };
    const calling = { ...state, players };
    for (const teamId of Object.keys(nations.teams)) {
      const plays = nations.matches.some((m) => (m.homeId === teamId || m.awayId === teamId) && m.date >= window.from && m.date <= window.until);
      const tournament = tournamentAfter(nations, teamId, window);
      if (!plays && !tournament) continue;
      const own = callUp(calling, nations, teamId, window.from, tournament?.until ?? window.until);
      callUps[teamId] = own;
      for (const id of own.playerIds) {
        const player = players[id];
        if (!player) continue;
        duty[id] = { teamId, until: own.until };
        events.push({ type: "calledUp", playerId: id, clubId: player.clubId, teamId, until: own.until });
      }
    }
    nations = { ...nations, callUps, duty };
    if (nations.picks && nations.job && callUps[nations.job.teamId]?.from === window.from) {
      nations = { ...nations };
      delete nations.picks;
    }
  }

  nations = { ...withLiveOffer(nations, state.date), rngState: random.state() };
  let next: GameState = { ...state, players, nations };
  for (const finished of events.flatMap((e) => (e.type === "nationalTitle" ? [e.competitionId] : []))) {
    const competition = next.nations?.competitions[finished];
    if (!competition) continue;
    const jobs = nationalJobsAfter(next, competition, today);
    next = jobs.state;
    events.push(...jobs.events);
  }
  return { state: next, events };
}
