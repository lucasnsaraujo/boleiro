import { compareText } from "./compareText.js";
import { addDays, daysBetween } from "./dates.js";
import { formatsOf } from "./formats.js";
import type { Competition, ContinentalCompetition, CupCompetition, Fixture, GameState, IsoDate } from "./gameState.js";
import { isLeagueResting, MIN_DAYS_BETWEEN_GAMES } from "./seasonCalendar.js";
import { tieResults } from "./tieResults.js";

// CBF keeps a round on its day and moves only the league game of a club with a cup match next to it, to a free
// day later in the season: in 2025 it postponed the Série A games of the four Club World Cup clubs, played once
// their cup runs left a midweek free (Soccerway, https://br.soccerway.com/noticias/futebol-brasileirao-betano-cbf-detalha-tabela-do-brasileirao-nas-rodadas-pos-mundial-veja-datas-e-horarios/vPlE2Ew1).
// A game on a cup match's day, or the day before or after it, moves.
const NEXT_TO_CUP_DAYS = 2;

const isCup = (competition: Competition | undefined): boolean => competition?.kind === "continental" || competition?.kind === "cup" || competition?.kind === "cupAbroad";

type Game = Pick<Fixture, "id" | "date">;

const isWithin = (days: number, a: IsoDate, b: IsoDate) => Math.abs(daysBetween(a, b)) < days;

function pushTo<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** Whether a club may still play a cup's stages to come: it joins one of them, or it is in the latest drawn and not knocked out of it. */
function isStillIn(cup: ContinentalCompetition | CupCompetition, clubId: string, fixtures: readonly Fixture[]): boolean {
  if (cup.entries.slice(cup.stages.length).some((entries) => entries.includes(clubId))) return true;
  const index = cup.stages.length - 1;
  const latest = cup.stages[index];
  if (!latest) return false;
  if (latest.kind === "groups") return latest.groups.some((group) => group.includes(clubId));
  const tie = latest.ties.findIndex((clubs) => clubs.includes(clubId));
  if (tie < 0) return false;
  const legs = fixtures.filter((f) => f.stage === index);
  return legs.some((f) => f.tie === tie && !f.result) || tieResults(latest, legs)[tie]?.winnerId === clubId;
}

/** How far a postponed game may go: the rest it keeps from both clubs' other games, whether it keeps clear of the days their cups may still want them, and whether it may pass its stage's last round. */
type Leeway = { rest: number; isClearOfCups: boolean; isPastLastRound: boolean };

// A game takes the first day of the first leeway that has one. A club deep in its cups may have no such day
// before the last round; guess: then the game keeps a day's rest only, and last, in a league's final stage, goes
// up to four weeks past the round, inside its year (CBF stretched 2025's Série A to 7 Dec for its postponed games,
// Soccerway above); a stage another follows must end on its own last round.
const LEEWAYS: readonly Leeway[] = [
  { rest: MIN_DAYS_BETWEEN_GAMES, isClearOfCups: true, isPastLastRound: false },
  { rest: MIN_DAYS_BETWEEN_GAMES, isClearOfCups: false, isPastLastRound: false },
  { rest: NEXT_TO_CUP_DAYS, isClearOfCups: false, isPastLastRound: false },
  { rest: NEXT_TO_CUP_DAYS, isClearOfCups: false, isPastLastRound: true },
];
const DAYS_PAST_LAST_ROUND = 28;

/**
 * The day a league game moves to: the first after its round, on the first of the LEEWAYS with one (past the last
 * round only when `isFinalStage`), on which its league plays; null when none has.
 */
function postponedDate(game: Fixture, last: IsoDate, isFinalStage: boolean, gamesOf: (clubId: string) => readonly Game[], cupDaysOf: (clubId: string) => readonly IsoDate[], isResting: (date: IsoDate) => boolean): IsoDate | null {
  const clubs = [game.homeId, game.awayId];
  const isRested = (date: IsoDate, rest: number) => clubs.every((id) => gamesOf(id).every((other) => other.id === game.id || !isWithin(rest, other.date, date)));
  const isClearOfCups = (date: IsoDate) => clubs.every((id) => cupDaysOf(id).every((day) => !isWithin(NEXT_TO_CUP_DAYS, day, date)));
  const yearEnd = `${last.slice(0, 4)}-12-31`;
  for (const leeway of LEEWAYS.filter((l) => isFinalStage || !l.isPastLastRound)) {
    const until = leeway.isPastLastRound ? [addDays(last, DAYS_PAST_LAST_ROUND), yearEnd].sort(compareText)[0] ?? last : addDays(last, -1);
    for (let date = addDays(game.date, 1); date <= until; date = addDays(date, 1)) {
      if (!isResting(date) && isRested(date, leeway.rest) && (!leeway.isClearOfCups || isClearOfCups(date))) return date;
    }
  }
  return null;
}

/**
 * The game with every league game still to play whose club has a cup match (a continental cup, the Copa do
 * Brasil, a cup abroad) on its day or the day either side moved to a later day before its stage's last round
 * (past it only in a league's final stage, when no day before it takes the game); the round keeps its day and
 * the game keeps it as `postponedFrom`. The same game when no game clashes.
 */
export function postponeClashingGames(state: GameState): GameState {
  const { competitions, date: today } = state;
  const cupMatchDays = new Map<string, IsoDate[]>();
  for (const f of state.fixtures) {
    if (f.result || f.date < today || !isCup(competitions[f.competitionId])) continue;
    for (const id of [f.homeId, f.awayId]) pushTo(cupMatchDays, id, f.date);
  }
  if (!cupMatchDays.size) return state;
  const lastDayOf = (f: Fixture): IsoDate | null => {
    const competition = competitions[f.competitionId];
    return competition?.kind === "league" && competition.stages[f.stage]?.kind === "groups" ? (competition.stageDates[f.stage]?.at(-1) ?? null) : null;
  };
  const isNextToCup = (f: Fixture) => [f.homeId, f.awayId].some((id) => cupMatchDays.get(id)?.some((day) => isWithin(NEXT_TO_CUP_DAYS, day, f.date)));
  const clashing = state.fixtures.filter((f) => !f.result && f.date >= today && f.date < (lastDayOf(f) ?? "") && isNextToCup(f));
  if (!clashing.length) return state;

  const games = new Map<string, Game[]>();
  for (const f of [...state.fixtures, ...(state.friendlies ?? [])]) for (const id of [f.homeId, f.awayId]) pushTo(games, id, f);
  const cupFixtures = new Map<string, Fixture[]>();
  for (const f of state.fixtures) if (isCup(competitions[f.competitionId])) pushTo(cupFixtures, f.competitionId, f);
  const cupFixturesOf = (id: string) => cupFixtures.get(id) ?? [];
  const cupDays = new Map<string, IsoDate[]>();
  const cupDaysOf = (clubId: string): IsoDate[] => {
    const known = cupDays.get(clubId);
    if (known) return known;
    const days = Object.values(competitions).flatMap((c) => ((c.kind === "continental" || c.kind === "cup") && isStillIn(c, clubId, cupFixturesOf(c.id)) ? c.stageDates.slice(c.stages.length).flat() : []));
    cupDays.set(clubId, days);
    return days;
  };
  const formats = formatsOf(state);
  const moved = new Map<string, IsoDate>();
  for (const game of clashing.toSorted((a, b) => compareText(a.date, b.date) || compareText(a.id, b.id))) {
    const competition = competitions[game.competitionId];
    if (competition?.kind !== "league") continue;
    const isResting = isLeagueResting(competition, formats, state.nations !== undefined);
    const isFinalStage = game.stage === competition.stageDates.length - 1;
    const date = postponedDate(game, lastDayOf(game) ?? "", isFinalStage, (id) => games.get(id) ?? [], cupDaysOf, isResting);
    if (!date) continue;
    moved.set(game.id, date);
    for (const id of [game.homeId, game.awayId]) games.set(id, (games.get(id) ?? []).map((f) => (f.id === game.id ? { id: f.id, date } : f)));
  }
  if (!moved.size) return state;
  return { ...state, fixtures: state.fixtures.map((f) => { const date = moved.get(f.id); return date ? { ...f, date, postponedFrom: f.postponedFrom ?? f.date } : f; }) };
}
