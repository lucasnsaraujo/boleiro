import { isOnNeutralGround, neutralGround } from "@boleiro/engine/sim/continental/neutralGrounds";
import { addDays } from "@boleiro/engine/sim/dates";
import type { Fixture, GameState, IsoDate } from "@boleiro/engine/sim/gameState";
import { isInjured } from "@boleiro/engine/sim/players/isInjured";
import { transferWindowsOf } from "@boleiro/engine/sim/transfers/transferWindows";
import { competitionName, fixtureLabel } from "@boleiro/game-client/format/competitionName";
import { monthName } from "@boleiro/game-client/format/formatGameDate";

export type Outcome = "win" | "draw" | "loss";

/** One of the coach's games: `sideId` is his side in it, his club or his national team; `isNeutral` a national team's game on neutral ground. */
export type MatchEntry = {
  kind: "match";
  date: IsoDate;
  fixtureId: string;
  competition: string;
  isHome: boolean;
  isNeutral: boolean;
  sideId: string;
  opponentId: string;
  result: { homeGoals: number; awayGoals: number; outcome: Outcome; onPenalties: boolean; isAfterExtraTime?: true } | null;
};

export type CalendarEntry = MatchEntry | { kind: "window"; date: IsoDate; opens: boolean };

/** One month of the season: the coach's games and the transfer window's dates, in date order. */
export type CalendarMonth = { month: number; entries: CalendarEntry[]; hasWindow: boolean };

type MatchesState = Pick<GameState, "coachClubId" | "fixtures" | "competitions"> & Partial<Pick<GameState, "nations">>;

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const monthOf = (date: IsoDate) => Number(date.slice(5, 7));
const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function outcomeOf(goalsFor: number, goalsAgainst: number, penaltyWinnerId: string | undefined, clubId: string): Outcome {
  if (penaltyWinnerId) return penaltyWinnerId === clubId ? "win" : "loss";
  return goalsFor > goalsAgainst ? "win" : goalsFor < goalsAgainst ? "loss" : "draw";
}

function matchEntry(f: Fixture, coachClubId: string, competitions: GameState["competitions"]): MatchEntry {
  const isHome = f.homeId === coachClubId;
  const competition = competitions[f.competitionId];
  const { result } = f;
  return {
    kind: "match",
    date: f.date,
    fixtureId: f.id,
    competition: competition ? competitionName(competition) : "",
    isHome,
    isNeutral: competition?.kind === "national" && isOnNeutralGround(competition, f.stage),
    sideId: coachClubId,
    opponentId: isHome ? f.awayId : f.homeId,
    result: result && {
      homeGoals: result.homeGoals,
      awayGoals: result.awayGoals,
      outcome: isHome
        ? outcomeOf(result.homeGoals, result.awayGoals, result.penaltyWinnerId, coachClubId)
        : outcomeOf(result.awayGoals, result.homeGoals, result.penaltyWinnerId, coachClubId),
      onPenalties: result.penaltyWinnerId !== undefined,
      ...(result.isAfterExtraTime ? { isAfterExtraTime: true as const } : {}),
    },
  };
}

/** The coach's fixtures of the season, his club's and his national team's, in date order, each with his side in it. */
function coachFixtures({ coachClubId, fixtures, nations }: Pick<GameState, "coachClubId" | "fixtures"> & Partial<Pick<GameState, "nations">>): { fixture: Fixture; sideId: string }[] {
  const sides = [coachClubId, nations?.job?.teamId].filter((id): id is string => id !== null && id !== undefined);
  if (!sides.length) return [];
  return fixtures
    .flatMap((fixture) => {
      const sideId = sides.find((id) => fixture.homeId === id || fixture.awayId === id);
      return sideId ? [{ fixture, sideId }] : [];
    })
    .toSorted((a, b) => a.fixture.date.localeCompare(b.fixture.date));
}

function coachMatches(state: MatchesState): MatchEntry[] {
  return coachFixtures(state).map(({ fixture, sideId }) => matchEntry(fixture, sideId, state.competitions));
}

/** A game still to play, with its competition and round: "Série A · 31ª rodada"; `ground` names a neutral ground. */
export type UpcomingMatch = MatchEntry & { competitionId: string; label: string; ground: string | null };

/** The coach's next `count` games from today on, the first of them the one the play button leads to. */
export function upcomingMatches(state: Pick<GameState, "date"> & MatchesState, count: number): UpcomingMatch[] {
  const { date, competitions } = state;
  return coachFixtures(state)
    .filter(({ fixture }) => !fixture.result && fixture.date >= date)
    .slice(0, count)
    .map(({ fixture: f, sideId }) => {
      const competition = competitions[f.competitionId];
      return { ...matchEntry(f, sideId, competitions), competitionId: f.competitionId, label: competition ? fixtureLabel(competition, f) : "", ground: competition ? neutralGround(competition, f) : null };
    });
}

/** The season's twelve months; a league abroad crossing the new year shows its games of each year in that year's months. */
export function calendarMonths(state: Pick<GameState, "season" | "hasMidSeasonWindow"> & MatchesState): CalendarMonth[] {
  const year = String(state.season);
  const entries: CalendarEntry[] = coachMatches(state).filter((match) => match.date.startsWith(year));
  const transferWindows = transferWindowsOf(state);
  for (const window of transferWindows) {
    entries.push({ kind: "window", date: `${state.season}-${window.opens}`, opens: true }, { kind: "window", date: `${state.season}-${window.closes}`, opens: false });
  }
  entries.sort((a, b) => a.date.localeCompare(b.date));
  const windowMonths = new Set(transferWindows.flatMap(({ opens, closes }) => MONTHS.filter((m) => m >= Number(opens.slice(0, 2)) && m <= Number(closes.slice(0, 2)))));
  return MONTHS.map((month) => ({ month, entries: entries.filter((e) => monthOf(e.date) === month), hasWindow: windowMonths.has(month) }));
}

export type Absence = { name: string; reason: "injured" | "suspended" };

/** The coach's players who miss the game: still injured on its day, or banned in its competition. A national team's game is not his club's: none. */
export function matchAbsences(
  { coachClubId, players, discipline, competitions }: Pick<GameState, "coachClubId" | "players" | "discipline" | "competitions">,
  { date, competitionId }: Pick<UpcomingMatch, "date" | "competitionId">,
): Absence[] {
  if (competitions[competitionId]?.kind === "national") return [];
  const records = discipline[competitionId] ?? {};
  return Object.values(players).flatMap((p): Absence[] => {
    if (p.clubId !== coachClubId) return [];
    if (isInjured(p, date)) return [{ name: p.name, reason: "injured" }];
    return (records[p.id]?.bans ?? 0) > 0 ? [{ name: p.name, reason: "suspended" }] : [];
  });
}

const PAGE_WEEKS = 5;
const PAGE_DAYS = PAGE_WEEKS * 7;

/** One square of a page: its place in the five-week grid, and whether it is today or already gone. */
export type CalendarDay = { date: IsoDate; day: number; row: number; column: number; isInSeason: boolean; isToday: boolean; isPast: boolean };

/** A game on a page, with the square of its day; `stack` 1 for the second game of a day (a club's and a national team's). */
export type PageMatch = MatchEntry & { row: number; column: number; stack: number };

/**
 * The transfer window on a page, drawn across one week: the week it opens or closes in, or the
 * last week when the whole page sits inside it. It belongs to the month of `date`.
 */
export type WindowRibbon = { status: "opens" | "closes" | "open"; date: IsoDate; row: number; opensOn: IsoDate; closesOn: IsoDate };

/** Five weeks of the calendar, and the season's months on them, each with its games and window marks. */
export type CalendarPage = {
  start: IsoDate;
  title: string;
  days: CalendarDay[];
  months: { month: number; matches: PageMatch[]; windows: WindowRibbon[] }[];
  hasPrevious: boolean;
  hasNext: boolean;
};

/** The Monday on or before the day: pages always start a week. */
export function pageStartOf(date: IsoDate): IsoDate {
  const weekday = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(date, -weekday);
}

const firstPageOf = (season: number) => pageStartOf(`${season}-01-01`);
const lastPageOf = (season: number) => addDays(pageStartOf(`${season}-12-31`), -(PAGE_WEEKS - 1) * 7);

/** The page that shows the day, from its week on; the season's first and last pages never run past it. */
export function pageFor(season: number, date: IsoDate): IsoDate {
  const start = pageStartOf(date);
  const first = firstPageOf(season);
  const last = lastPageOf(season);
  return start < first ? first : start > last ? last : start;
}

/** The page `pages` pages after the one starting on `start`, or before it when negative. */
export function turnPage(season: number, start: IsoDate, pages: number): IsoDate {
  return pageFor(season, addDays(start, pages * PAGE_DAYS));
}

/** Five weeks of the season from `start`, a Monday. */
export function calendarPage(state: Pick<GameState, "date" | "season" | "hasMidSeasonWindow"> & MatchesState, start: IsoDate): CalendarPage {
  const { date, season } = state;
  const days = Array.from({ length: PAGE_DAYS }, (_, index): CalendarDay => {
    const day = addDays(start, index);
    return {
      date: day,
      day: Number(day.slice(8, 10)),
      row: Math.floor(index / 7) + 1,
      column: (index % 7) + 1,
      isInSeason: Number(day.slice(0, 4)) === season,
      isToday: day === date,
      isPast: day < date,
    };
  });
  const squares = new Map(days.map((d) => [d.date, d]));
  const onDay = new Map<IsoDate, number>();
  const matches = coachMatches(state).flatMap((match) => {
    const square = squares.get(match.date);
    if (!square) return [];
    const stack = onDay.get(match.date) ?? 0;
    onDay.set(match.date, stack + 1);
    return [{ ...match, row: square.row, column: square.column, stack }];
  });
  const end = days.at(-1)?.date ?? start;
  const windows = transferWindowsOf(state).flatMap(({ opens, closes }): WindowRibbon[] => {
    const opensOn = `${season}-${opens}`;
    const closesOn = `${season}-${closes}`;
    if (closesOn < start || opensOn > end) return [];
    const [status, date] = opensOn >= start ? (["opens", opensOn] as const) : closesOn <= end ? (["closes", closesOn] as const) : (["open", end] as const);
    return [{ status, date, row: squares.get(date)?.row ?? PAGE_WEEKS, opensOn, closesOn }];
  });
  const months = [...new Set(days.filter((d) => d.isInSeason).map((d) => monthOf(d.date)))];
  return {
    start,
    title: capitalized(months.map(monthName).join(" e ")),
    days,
    months: months.map((month) => ({
      month,
      matches: matches.filter((m) => monthOf(m.date) === month),
      windows: windows.filter((w) => monthOf(w.date) === month),
    })),
    hasPrevious: start > firstPageOf(season),
    hasNext: start < lastPageOf(season),
  };
}
