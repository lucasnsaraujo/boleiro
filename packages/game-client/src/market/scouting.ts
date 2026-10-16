import { NO_FILTERS, type MarketFilters } from "./marketFilters.js";

/** A market search the coach keeps under a name, to run again with one click. */
export type SavedFilter = { name: string; filters: MarketFilters };
/** A coach's own scouting: the players he watches and the searches he saved. Each hot-seat coach has his own. */
export type Scouting = { watchList: string[]; savedFilters: SavedFilter[] };

export const EMPTY_SCOUTING: Scouting = { watchList: [], savedFilters: [] };

/** Puts the player on the watch list (`isWatched`) or takes him off it. */
export function watch(scouting: Scouting, playerId: string, isWatched: boolean): Scouting {
  const others = scouting.watchList.filter((id) => id !== playerId);
  return { ...scouting, watchList: isWatched ? [...others, playerId] : others };
}

/** Keeps the filters under `name`, trimmed, in place of any saved under it before. */
export function keepFilter(scouting: Scouting, name: string, filters: MarketFilters): Scouting {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("a saved filter needs a name");
  return { ...scouting, savedFilters: [...scouting.savedFilters.filter((saved) => saved.name !== trimmed), { name: trimmed, filters }] };
}

export function forgetFilter(scouting: Scouting, name: string): Scouting {
  return { ...scouting, savedFilters: scouting.savedFilters.filter((saved) => saved.name !== name) };
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/** Saved filters as a save holds them: a criterion the market added since reads as off. */
function filtersOf(saved: Record<string, unknown>): MarketFilters {
  const filters: Record<string, unknown> = { ...NO_FILTERS };
  for (const key of Object.keys(NO_FILTERS)) if (key in saved) filters[key] = saved[key];
  return filters as MarketFilters;
}

/** A coach's scouting as a save holds it, or null when it is malformed. */
export function readScouting(value: unknown): Scouting | null {
  if (!isRecord(value) || !Array.isArray(value.watchList) || !Array.isArray(value.savedFilters)) return null;
  const watchList = value.watchList.filter((id): id is string => typeof id === "string");
  if (watchList.length !== value.watchList.length) return null;
  const savedFilters: SavedFilter[] = [];
  for (const saved of value.savedFilters) {
    if (!isRecord(saved) || typeof saved.name !== "string" || !isRecord(saved.filters)) return null;
    savedFilters.push({ name: saved.name, filters: filtersOf(saved.filters) });
  }
  return { watchList, savedFilters };
}
