import type { IsoDate } from "./gameState.js";

const DAY_MS = 86_400_000;
// Date.parse and toISOString are hot (fatigue, contract windows); a season uses a few hundred dates.
const CACHE_LIMIT = 10_000;
const parsed = new Map<IsoDate, number>();
const shifted = new Map<string, IsoDate>();

function remember<K, V>(cache: Map<K, V>, key: K, value: V): V {
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(key, value);
  return value;
}

const parse = (date: IsoDate): number => parsed.get(date) ?? remember(parsed, date, Date.parse(date));

export function addDays(date: IsoDate, days: number): IsoDate {
  const key = `${date}|${days}`;
  return shifted.get(key) ?? remember(shifted, key, new Date(parse(date) + days * DAY_MS).toISOString().slice(0, 10));
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((parse(to) - parse(from)) / DAY_MS);
}
