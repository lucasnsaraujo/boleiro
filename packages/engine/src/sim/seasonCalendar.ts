import type { Division } from "@boleiro/data/players";
import type { IsoDate, SeasonCalendar } from "./gameState.js";
import type { UnifiedDates } from "./world/world.js";
import { addDays, daysBetween } from "./dates.js";
import { gameScales, knockoutDates, REALISTA, type Formats } from "./formats.js";
import { isInFifaWindow, worldCupOf } from "./nations/fifaCalendar.js";

// Date-bases of the CBF 2026 calendar (Trivela, https://trivela.com.br/brasil/calendario-do-futebol-brasileiro-2026/):
// state championships 11 Jan–8 Mar with 11 dates, Série A 28 Jan–2 Dec, B 21 Mar–28 Nov,
// C 5 Apr–25 Oct, D 5 Apr–13 Sep. Later seasons reuse them on the same weekday.
const LEAGUE_WINDOWS: Record<Division, [IsoDate, IsoDate]> = {
  A: ["2026-01-28", "2026-12-02"],
  B: ["2026-03-21", "2026-11-28"],
  C: ["2026-04-05", "2026-10-25"],
  D: ["2026-04-05", "2026-09-13"],
};

// Every Sunday from 11 Jan to 8 Mar is a real date-base; the two Wednesdays that make 11 dates are a guess.
const STATE_CHAMPIONSHIP_DATES: IsoDate[] = [
  "2026-01-11", "2026-01-14", "2026-01-18", "2026-01-21", "2026-01-25",
  "2026-02-01", "2026-02-08", "2026-02-15", "2026-02-22", "2026-03-01", "2026-03-08",
];

// Copa do Brasil 2026: phases 1–4 single leg, phase 5 to semi-finals two legs, single-leg final on 6 Dec
// (Band, https://www.band.com.br/esportes/conheca-o-novo-formato-da-copa-do-brasil-a-partir-de-2026-202510011208).
// Phase 1 on 18 Feb (Band), phases 3 and 4 on 11 and 18 Mar (BNews), round of 16 on 2 and 8 Aug and
// quarter-finals on 26 Aug and 2 Sep (Netflu).
const COPA_DO_BRASIL_ROUNDS: { name: string; dates: IsoDate[] }[] = [
  { name: "phase-1", dates: ["2026-02-18"] },
  { name: "phase-2", dates: ["2026-02-25"] }, // guess: the week between the sourced phases 1 and 3
  { name: "phase-3", dates: ["2026-03-11"] },
  { name: "phase-4", dates: ["2026-03-18"] },
  { name: "phase-5", dates: ["2026-04-22", "2026-05-13"] }, // guess: no published date found
  { name: "round-of-16", dates: ["2026-08-02", "2026-08-08"] },
  { name: "quarter-finals", dates: ["2026-08-26", "2026-09-02"] },
  { name: "semi-finals", dates: ["2026-10-28", "2026-11-04"] }, // guess: reported 1 and 13 Nov fall on a Sunday and a Friday
  { name: "final", dates: ["2026-12-06"] },
];

const LEAGUE_WEEKDAYS = new Set([0, 3, 6]); // guess: Sunday, Wednesday and Saturday, the usual Brasileirão match days
export const MIN_DAYS_BETWEEN_GAMES = 3; // guess: two full rest days, the shortest gap CBF schedules in practice
// guess: a Série A or B round keeps at least a day's rest from a continental match day, as CBF moves
// the games of clubs in CONMEBOL's cups; only one or two clubs a round play both.
const MIN_DAYS_FROM_CONTINENTAL = 2;
const CLEAR_OF_CONTINENTAL = new Set<Division>(["A", "B"]);

/** Which days a league may play on: the weekdays, and how many days a round keeps from a continental match day. */
type Leeway = { weekdays: ReadonlySet<number>; daysFromContinental: number };

// What a season that does not fit gives up, one step at a time and only for as many dates as it lacks, before
// it fails: CBF plays a midweek round over Wednesday and Thursday when it must; then a round may sit the day
// next to a continental match day (CBF moves the games of the clubs that play both, as postponeClashingGames
// does); last, any day of the week. The rest from the estaduais' and the Copa do Brasil's days and
// the FIFA windows' rest are never given up.
const LEEWAYS: readonly Leeway[] = [
  { weekdays: LEAGUE_WEEKDAYS, daysFromContinental: MIN_DAYS_FROM_CONTINENTAL },
  { weekdays: new Set([...LEAGUE_WEEKDAYS, 4]), daysFromContinental: MIN_DAYS_FROM_CONTINENTAL },
  { weekdays: new Set([...LEAGUE_WEEKDAYS, 4]), daysFromContinental: 1 },
  { weekdays: new Set([0, 1, 2, 3, 4, 5, 6]), daysFromContinental: 1 },
];

/** A 2026 date moved to `season`, on the same weekday within three days. */
export function inSeason(date2026: IsoDate, season: number): IsoDate {
  const shifted = `${season}${date2026.slice(4)}`;
  const shift = (new Date(date2026).getUTCDay() - new Date(shifted).getUTCDay() + 7) % 7;
  return addDays(shifted, shift > 3 ? shift - 7 : shift);
}

/**
 * For each of the sorted `candidates`, the index of the first one far enough after it to follow it (`after`)
 * and the most dates the candidates from it on can hold (`most`, one longer, its last 0).
 */
function fitOf(candidates: readonly IsoDate[]): { after: number[]; most: number[] } {
  const after: number[] = [];
  for (let i = 0, k = 0; i < candidates.length; i++) {
    while (k < candidates.length && daysBetween(candidates[i] as IsoDate, candidates[k] as IsoDate) < MIN_DAYS_BETWEEN_GAMES) k++;
    after.push(k);
  }
  const most = new Array<number>(candidates.length + 1).fill(0);
  for (let i = candidates.length - 1; i >= 0; i--) most[i] = Math.max(most[i + 1] ?? 0, 1 + (most[after[i] ?? candidates.length] ?? 0));
  return { after, most };
}

const mostDatesIn = (candidates: readonly IsoDate[]): number => fitOf(candidates).most[0] ?? 0;

/**
 * `candidates` with as few of `extras` added as hold `count` dates: one at a time, the first that adds a date;
 * all of them when no single one does.
 */
function withFewestExtras(candidates: readonly IsoDate[], extras: readonly IsoDate[], count: number): IsoDate[] {
  let kept = [...candidates];
  const left = [...extras];
  while (left.length > 0 && mostDatesIn(kept) < count) {
    const most = mostDatesIn(kept);
    const index = left.findIndex((extra) => mostDatesIn([...kept, extra].sort()) > most);
    if (index < 0) return [...kept, ...left].sort();
    kept = [...kept, ...left.splice(index, 1)].sort();
  }
  return kept;
}

/**
 * `count` of `candidates` spread over the `span` days from `start`, at least MIN_DAYS_BETWEEN_GAMES apart:
 * each the first candidate on or after its even share of the span, unless taking it, or passing it, would
 * leave too few candidates for the dates still to place; null when the candidates hold fewer than `count`.
 */
function spreadDates(candidates: readonly IsoDate[], count: number, start: IsoDate, span: number): IsoDate[] | null {
  const { after, most } = fitOf(candidates);
  if ((most[0] ?? 0) < count) return null;
  const picked: IsoDate[] = [];
  let next = 0;
  for (let i = 0; i < count; i++) {
    const target = count > 1 ? Math.floor((i * span) / (count - 1)) : 0;
    const left = count - i;
    for (;;) {
      const isDue = daysBetween(start, candidates[next] as IsoDate) >= target;
      const isTaken = isDue ? 1 + (most[after[next] ?? candidates.length] ?? 0) >= left : (most[next + 1] ?? 0) < left;
      if (isTaken) break;
      next++;
    }
    picked.push(candidates[next] as IsoDate);
    next = after[next] ?? candidates.length;
  }
  return picked;
}

/**
 * `count` league dates from `start` to `end`, kept off `reserved`, the days it `isResting` and, when it
 * `isClearOfContinental`, the continental days, on the first of the LEEWAYS they fit in; `name` labels the error.
 */
export function pickLeagueDates(
  name: string,
  [start, end]: [IsoDate, IsoDate],
  count: number,
  reserved: readonly IsoDate[],
  continental: readonly IsoDate[],
  isClearOfContinental: boolean,
  isResting: (date: IsoDate) => boolean = () => false,
): IsoDate[] {
  const span = daysBetween(start, end);
  const days = Array.from({ length: span + 1 }, (_, day) => addDays(start, day)).filter(
    (date) =>
      reserved.every((other) => Math.abs(daysBetween(date, other)) >= MIN_DAYS_BETWEEN_GAMES) && !isResting(date),
  );
  let candidates: IsoDate[] = [];
  for (const [step, { weekdays, daysFromContinental }] of LEEWAYS.entries()) {
    const allowed = days.filter(
      (date) =>
        weekdays.has(new Date(date).getUTCDay()) &&
        (!isClearOfContinental || continental.every((other) => Math.abs(daysBetween(date, other)) >= daysFromContinental)),
    );
    candidates = step === 0 ? allowed : withFewestExtras(candidates, allowed.filter((date) => !candidates.includes(date)), count);
    const picked = spreadDates(candidates, count, start, span);
    if (picked) return picked;
  }
  throw new Error(`${name}: ${count} dates do not fit between ${start} and ${end}`);
}

/**
 * `count` league dates over `division`'s window, kept off `reserved`, the days it `isResting` and, for the
 * divisions that keep clear of them, the continental days, on the first of the LEEWAYS they fit in.
 */
function pickDates(
  division: Division,
  count: number,
  season: number,
  reserved: readonly IsoDate[],
  continental: readonly IsoDate[],
  isClearOfContinental = CLEAR_OF_CONTINENTAL.has(division),
  isResting: (date: IsoDate) => boolean = () => false,
): IsoDate[] {
  const window = LEAGUE_WINDOWS[division].map((date) => inSeason(date, season)) as [IsoDate, IsoDate];
  return pickLeagueDates(`Série ${division} ${season}`, window, count, reserved, continental, isClearOfContinental, isResting);
}

/** The Copa do Brasil's rounds with the dates `formats` plays of them. */
const copaDoBrasilRounds = (season: number, formats: Formats) =>
  COPA_DO_BRASIL_ROUNDS.map(({ name, dates }) => ({ name, dates: knockoutDates(name, dates, formats).map((date) => inSeason(date, season)) }));

/** The Copa do Brasil's games per stage in its real format over those `formats` plays. */
export const copaDoBrasilGameScales = (formats: Formats): number[] | undefined =>
  gameScales(COPA_DO_BRASIL_ROUNDS.map((round) => round.dates.length), COPA_DO_BRASIL_ROUNDS.map(({ name, dates }) => knockoutDates(name, dates, formats).length));

// In a game with national football Série A pauses for the World Cup, as the CBF's 2026 table rests it from 1 Jun
// to 21 Jul around the 11 Jun–19 Jul World Cup (Portal Tela, below); its 38 rounds still fit every World Cup year,
// on a Thursday or next to a continental day where they must.
const SERIE_A_PAUSES_FOR_WORLD_CUP = true;
const WORLD_CUP_PAUSE = { daysBefore: 10, daysAfter: 2 };

/** Whether Série A rests on a day in a game with national football: in a FIFA window or, when it pauses for it, around the season's World Cup. */
function isSerieAResting(season: number, pausesForWorldCup: boolean): (date: IsoDate) => boolean {
  const worldCup = pausesForWorldCup ? worldCupOf(season) : null;
  const pause = worldCup && { from: addDays(worldCup.from, -WORLD_CUP_PAUSE.daysBefore), until: addDays(worldCup.until, WORLD_CUP_PAUSE.daysAfter) };
  return (date) => isInFifaWindow(date) || (pause !== null && date >= pause.from && date <= pause.until);
}

/**
 * The season's dates; `continental` are the continental cups' match days, in a game that plays them.
 * On the unified calendar every division's rounds follow one grid of `gridRounds` match days (at least
 * as many as any league in the game plays) over Série A's window, every one of them clear of the
 * continental days, so round k of every league falls on the same day. In a game with national football
 * (`restsInFifaWindows`) Série A rests in the FIFA windows on the real calendar, as the CBF's 2026 table does
 * (Portal Tela, https://www.portaltela.com/esporte/futebol/2026/01/27/paralisacoes-do-brasileirao-2026-coincidem-com-a-copa-do-mundo-confira/);
 * guess: Séries B to D and the unified grid play through them, without their called-up players. With
 * `pausesForWorldCup` (the default) Série A also rests through a World Cup, as that table does.
 */
export function seasonCalendar(
  season: number,
  dateCounts: Record<Division, number>,
  continental: readonly IsoDate[] = [],
  formats: Formats = REALISTA,
  gridRounds = 0,
  restsInFifaWindows = false,
  pausesForWorldCup = SERIE_A_PAUSES_FOR_WORLD_CUP,
): SeasonCalendar {
  const stateChampionshipDates = STATE_CHAMPIONSHIP_DATES.map((date) => inSeason(date, season));
  const copaDoBrasil = copaDoBrasilRounds(season, formats);
  const reserved = [...stateChampionshipDates, ...copaDoBrasil.flatMap((round) => round.dates)];
  if (formats.calendar === "unified") {
    const leagueGrid = pickDates("A", Math.max(gridRounds, ...Object.values(dateCounts)), season, reserved, continental, true);
    const leagueDates = { A: leagueGrid.slice(0, dateCounts.A), B: leagueGrid.slice(0, dateCounts.B), C: leagueGrid.slice(0, dateCounts.C), D: leagueGrid.slice(0, dateCounts.D) };
    return { season, stateChampionshipDates, copaDoBrasilRounds: copaDoBrasil, leagueDates, leagueGrid };
  }
  const leagueDates = {
    A: pickDates("A", dateCounts.A, season, reserved, continental, undefined, restsInFifaWindows ? isSerieAResting(season, pausesForWorldCup) : undefined),
    B: pickDates("B", dateCounts.B, season, reserved, continental),
    C: pickDates("C", dateCounts.C, season, reserved, continental),
    D: pickDates("D", dateCounts.D, season, reserved, continental),
  };
  return { season, stateChampionshipDates, copaDoBrasilRounds: copaDoBrasil, leagueDates };
}

/** Whether `division` rests on a day of `season`: Série A on the real calendar of a game with national football (`restsInFifaWindows`), as `seasonCalendar` places its rounds. */
export function isLeagueResting(division: Division | null, season: number, formats: Formats, restsInFifaWindows: boolean): (date: IsoDate) => boolean {
  return division === "A" && formats.calendar !== "unified" && restsInFifaWindows ? isSerieAResting(season, SERIE_A_PAUSES_FOR_WORLD_CUP) : () => false;
}

/** The days a result-only country plays on in a season of the unified calendar: the leagues' grid and the Copa do Brasil's midweeks; none on a real calendar. */
export function unifiedDatesOf(calendar: SeasonCalendar): UnifiedDates | undefined {
  return calendar.leagueGrid && { league: calendar.leagueGrid, cup: calendar.copaDoBrasilRounds.flatMap((round) => round.dates.slice(0, 1)) };
}
