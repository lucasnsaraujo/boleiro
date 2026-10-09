import type { IsoDate } from "./gameState.js";

const DAY_MS = 86_400_000;

export function addDays(date: IsoDate, days: number): IsoDate {
  return new Date(Date.parse(date) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
}
