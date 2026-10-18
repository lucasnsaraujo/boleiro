import { humanKey } from "../coach/closeCoachSeason.js";
import { daysBetween } from "../dates.js";
import type { GameState } from "../gameState.js";
import type { CoachRecord, CoachStint } from "../history/history.js";
import { derbyWinsOf } from "../rivalries/rivalryMemory.js";
import { rivalryOf } from "../rivalries/rivalryOf.js";
import type { IdolEntry } from "./careerMoments.js";

/** A human coach as the fans read him: his name (none in a one-coach game) and career record. */
export type HumanCoach = { name: string | undefined; record: CoachRecord };

/** The fans' standing of a coach at one club, and the ledger behind it, oldest first. */
export type IdolStanding = { points: number; ledger: IdolEntry[] };

// guess: a coach becomes one of the club's own at 80 points: 16 a year in charge, 24 a title, 4 a derby
// won. Five years do it alone; so do three years with a title and two derbies.
export const IDOL_LINE = 80;
const YEAR_POINTS = 16;
const TITLE_POINTS = 24;
const DERBY_WIN_POINTS = 4;
const YEAR_DAYS = 365.25;
// guess: the fans hold a walk-out against him; a sacking they put on the board, so it costs him nothing.
const LEFT_POINTS: Record<NonNullable<CoachStint["left"]>, number> = { resigned: -16, fired: 0, contractEnded: 0, moved: 0, retired: 0 };
// guess: taking the job at the club's big derby rival next undoes most of what he built.
const RIVAL_MOVE_POINTS = -48;
// The derby intensity from which a move across it is treason (rivalries/idols.ts blocks offers from the same line).
const TREASON_FROM_INTENSITY = 3;

/**
 * How a club's fans stand with a human coach, from his years in charge there, the titles he won for it,
 * the derbies he won and how he left: walking out costs him, and so does going straight to their rival.
 */
export function idolStandingOf(state: Pick<GameState, "date" | "rivalries">, coach: HumanCoach, clubId: string): IdolStanding {
  const { stints, trophies } = coach.record;
  const ledger: IdolEntry[] = [];
  const days = stints.filter((s) => s.clubId === clubId).reduce((sum, s) => sum + daysBetween(s.from, s.until ?? state.date), 0);
  if (days > 0) ledger.push({ cause: "years", points: YEAR_POINTS * (days / YEAR_DAYS), count: days / YEAR_DAYS });
  for (const trophy of trophies) {
    if (trophy.clubId === clubId) ledger.push({ cause: "title", points: TITLE_POINTS, count: 1, competition: trophy.competition, season: trophy.season });
  }
  const derbies = derbyWinsOf(state, humanKey(coach.name), clubId);
  if (derbies > 0) ledger.push({ cause: "derbies", points: DERBY_WIN_POINTS * derbies, count: derbies });
  stints.forEach((stint, index) => {
    if (stint.clubId !== clubId || !stint.left) return;
    if (LEFT_POINTS[stint.left]) ledger.push({ cause: "left", points: LEFT_POINTS[stint.left], count: 1, left: stint.left });
    const nextClub = stints[index + 1]?.clubId;
    if (nextClub && (rivalryOf(clubId, nextClub)?.intensity ?? 0) >= TREASON_FROM_INTENSITY) ledger.push({ cause: "rivalMove", points: RIVAL_MOVE_POINTS, count: 1 });
  });
  return { points: ledger.reduce((sum, entry) => sum + entry.points, 0), ledger };
}

/** The standing as the fans' meter shows it, 0 to 100. */
export const meterOf = (standing: IdolStanding): number => Math.round(Math.min(100, Math.max(0, standing.points)));
