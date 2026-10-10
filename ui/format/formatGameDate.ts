import type { IsoDate } from "../../src/sim/gameState.js";

const LONG_DATE = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const MATCH_DATE = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const WEEKDAY = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" });
const MONTH = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" });

const asDate = (date: IsoDate) => new Date(`${date}T00:00:00Z`);

export function formatGameDate(date: IsoDate): string {
  return LONG_DATE.format(asDate(date));
}

/** "domingo, 11 de janeiro" */
export function formatMatchDate(date: IsoDate): string {
  return MATCH_DATE.format(asDate(date));
}

/** "dom 1", for a list that already sits under its month. */
export function formatRowDate(date: IsoDate): string {
  return `${WEEKDAY.format(asDate(date)).replace(".", "")} ${Number(date.slice(8, 10))}`;
}

/** "1 mar", for news from different months. */
export function formatDayMonth(date: IsoDate): string {
  return `${Number(date.slice(8, 10))} ${monthName(Number(date.slice(5, 7))).slice(0, 3)}`;
}

/** The month's name, from 1 (janeiro) to 12. */
export function monthName(month: number): string {
  return MONTH.format(new Date(Date.UTC(2026, month - 1, 1)));
}
