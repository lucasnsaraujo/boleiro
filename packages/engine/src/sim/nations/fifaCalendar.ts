import { addDays, daysBetween } from "../dates.js";
import type { IsoDate } from "../gameState.js";
import { inSeason } from "../seasonCalendar.js";

/** A FIFA international window: the days clubs release their players, and the days national teams play in it. */
export type FifaWindow = { from: IsoDate; until: IsoDate; matchDays: IsoDate[] };

/** A span of days, both ends included. */
export type Span = { from: IsoDate; until: IsoDate };

// The men's international match calendar 2026–2030, FIFA's, as the Wikipedia table "FIFA International Match
// Calendar" lists it (read 13 Oct 2026, .claude/research/immersion-sources.md §3); 2026's March and June windows
// from the CBF's 2026 Série A table (Portal Tela, https://www.portaltela.com/esporte/futebol/2026/01/27/paralisacoes-do-brasileirao-2026-coincidem-com-a-copa-do-mundo-confira/).
// That table rests Série A in every window and from 1 Jun to 21 Jul for the World Cup; a game with national
// football rests it in the windows (seasonCalendar) but plays it through the World Cup (guess), its called-up missing those games.
const WINDOWS: Record<number, [IsoDate, IsoDate][]> = {
  2026: [["2026-03-23", "2026-03-31"], ["2026-06-01", "2026-06-09"], ["2026-09-21", "2026-10-06"], ["2026-11-09", "2026-11-17"]],
  2027: [["2027-03-22", "2027-03-30"], ["2027-06-07", "2027-06-15"], ["2027-09-20", "2027-10-05"], ["2027-11-08", "2027-11-16"]],
  2028: [["2028-03-20", "2028-03-28"], ["2028-05-29", "2028-06-06"], ["2028-09-18", "2028-10-03"], ["2028-11-13", "2028-11-21"]],
  2029: [["2029-03-19", "2029-03-27"], ["2029-06-04", "2029-06-12"], ["2029-09-24", "2029-10-09"], ["2029-11-12", "2029-11-20"]],
  2030: [["2030-03-18", "2030-03-26"], ["2030-06-03", "2030-06-11"], ["2030-09-23", "2030-10-08"], ["2030-11-11", "2030-11-19"]],
};
const FIRST_KNOWN = 2026;
const LAST_KNOWN = 2030;
// guess: after 2030 FIFA keeps the 2027–2030 cycle, each window on the same weekdays.
const CYCLE_START = 2027;

// The 2026 World Cup, 11 Jun–19 Jul (FotMob, https://www.fotmob.com/api/data/leagues?id=77), and the 2030 one,
// 8 Jun–21 Jul (Wikipedia, "2030 FIFA World Cup", via immersion-sources.md §3); guess: later ones in mid-June
// and July like these, every four years.
const WORLD_CUPS: Record<number, Span> = { 2026: { from: "2026-06-11", until: "2026-07-19" }, 2030: { from: "2030-06-08", until: "2030-07-21" } };
const WORLD_CUP_EVERY = 4;

// Match days inside a window, as days after its first: a two-match window (Monday to the next Tuesday, FIFA's
// Type I) plays on its Friday and its Monday, the merged four-match window on Friday, Monday, Friday and Monday.
// guess: from the 2026 Nations League's days (24–26 and 27–29 Sep, 1–3 and 4–6 Oct, FotMob league 9806).
const TWO_MATCH_DAYS = [4, 7];
const FOUR_MATCH_DAYS = [4, 7, 11, 14];
const FOUR_MATCH_SPAN = 12;

function windowOf([from, until]: [IsoDate, IsoDate]): FifaWindow {
  const days = daysBetween(from, until) >= FOUR_MATCH_SPAN ? FOUR_MATCH_DAYS : TWO_MATCH_DAYS;
  return { from, until, matchDays: days.map((day) => addDays(from, day)) };
}

/** The season's FIFA windows, in order. */
export function fifaWindowsOf(season: number): FifaWindow[] {
  const known = WINDOWS[season];
  if (known) return known.map(windowOf);
  const source = season < FIRST_KNOWN ? WINDOWS[FIRST_KNOWN] : WINDOWS[CYCLE_START + ((season - CYCLE_START) % (LAST_KNOWN - CYCLE_START + 1))];
  return (source ?? []).map(([from, until]) => {
    const start = inSeason(from, season);
    return windowOf([start, addDays(start, daysBetween(from, until))]);
  });
}

/** The World Cup the season holds, if any. */
export function worldCupOf(season: number): Span | null {
  const known = WORLD_CUPS[season];
  if (known) return known;
  if (season < LAST_KNOWN || (season - LAST_KNOWN) % WORLD_CUP_EVERY !== 0) return null;
  const last = WORLD_CUPS[LAST_KNOWN] as Span;
  const from = inSeason(last.from, season);
  return { from, until: addDays(from, daysBetween(last.from, last.until)) };
}

const windowsBySeason = new Map<number, FifaWindow[]>();

/** Whether `date` falls inside one of its season's FIFA windows. */
export function isInFifaWindow(date: IsoDate): boolean {
  const season = Number(date.slice(0, 4));
  let windows = windowsBySeason.get(season);
  if (!windows) windowsBySeason.set(season, (windows = fifaWindowsOf(season)));
  return windows.some((w) => date >= w.from && date <= w.until);
}
