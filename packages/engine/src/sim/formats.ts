import type { IsoDate } from "./gameState.js";

/**
 * How a game lays out its season, chosen at new game. `calendar` "unified" puts every league and cup
 * on one match-day grid, so coaches in different countries play on the same days; "real" keeps each
 * country's own calendar. `leagueLegs` caps how often a league's clubs meet; `continentalGroups` is
 * the continental cups' first phase: groups of four meeting once (3 games) or twice (6), or their
 * real format (CONMEBOL's six-game groups, UEFA's league phase); `knockouts` are the cups' ties:
 * single matches, two legs only from the quarter-finals, or their real legs.
 */
export type Formats = {
  calendar: "unified" | "real";
  leagueLegs: 1 | 2;
  continentalGroups: "groups-3" | "groups-6" | "league-phase";
  knockouts: "single" | "late-two-legs" | "two-legs";
};

/** Today's real calendars and formats; a game saved before formats plays these. */
export const REALISTA: Formats = { calendar: "real", leagueLegs: 2, continentalGroups: "league-phase", knockouts: "two-legs" };

/**
 * One grid for everyone with short cups. guess: leagues keep both legs (the single round robin is
 * Personalizar's), and ties go two-legged from the quarter-finals, the final staying one match.
 */
export const RAPIDO: Formats = { calendar: "unified", leagueLegs: 2, continentalGroups: "groups-3", knockouts: "late-two-legs" };

export const isRealista = (formats: Formats): boolean =>
  formats.calendar === REALISTA.calendar &&
  formats.leagueLegs === REALISTA.leagueLegs &&
  formats.continentalGroups === REALISTA.continentalGroups &&
  formats.knockouts === REALISTA.knockouts;

/** The game's formats; a game without any plays Realista's. */
export const formatsOf = (game: { formats?: Formats }): Formats => game.formats ?? REALISTA;

const LATE_TWO_LEGGED = new Set(["quarter-finals", "semi-finals"]);

/** The dates a knockout round named `name` keeps from its real `dates`: its first one when it becomes a single match. */
export function knockoutDates(name: string, dates: readonly IsoDate[], formats: Formats): IsoDate[] {
  const isTwoLegged = formats.knockouts === "two-legs" || (formats.knockouts === "late-two-legs" && LATE_TWO_LEGGED.has(name));
  return isTwoLegged ? [...dates] : dates.slice(0, 1);
}

/** `count` of `dates`, spread from the first to the last. */
export function spreadPick<T>(dates: readonly T[], count: number): T[] {
  if (count >= dates.length) return [...dates];
  return Array.from({ length: count }, (_, i) => dates[count > 1 ? Math.round((i * (dates.length - 1)) / (count - 1)) : 0] as T);
}

/** Group matchdays the format plays out of a cup's real six. */
export function groupDates(dates: readonly IsoDate[], formats: Formats): IsoDate[] {
  return formats.continentalGroups === "groups-3" ? spreadPick(dates, 3) : [...dates];
}

/**
 * Each stage's games in the real format over its games in this one, when they differ, so a club's
 * gate over a shorter season adds up to a real season's; absent when every stage plays as many.
 */
export function gameScales(realCounts: readonly number[], counts: readonly number[]): number[] | undefined {
  const scales = counts.map((count, stage) => (count > 0 ? (realCounts[stage] ?? count) / count : 1));
  return scales.every((scale) => scale === 1) ? undefined : scales;
}
