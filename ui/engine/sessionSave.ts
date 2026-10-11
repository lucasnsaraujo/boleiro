import type { GameState } from "../../src/sim/gameState.js";
import type { LiveDay } from "../../src/sim/live/liveDay.js";
import { toGameState } from "../../src/sim/saveGame.js";
import type { TurningPoint } from "../hub/turningPoints.js";
import { EMPTY_DESK, type BoardDesk } from "../market/boardDesk.js";

/** A match day under way and the furthest minute the screen has shown of it. */
export type LiveRoundSave = { day: LiveDay; seenMinute: number };
/** What a save holds: the sim's game, plus the session's own state the sim does not keep. */
export type SessionSave = { game: GameState; desk: BoardDesk; turningPoints: TurningPoint[]; live: LiveRoundSave | null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDesk(value: unknown): value is BoardDesk {
  return isRecord(value) && Array.isArray(value.pending) && Array.isArray(value.answers) && Array.isArray(value.forcedSales);
}

function isTurningPoints(value: unknown): value is TurningPoint[] {
  return Array.isArray(value) && value.every((point) => isRecord(point) && (point.kind === "fired" || point.kind === "seasonEnd"));
}

/** A live day as saved: its state is the game kicked off from, kept once under `game`. */
type SavedLive = { day: Omit<LiveDay, "state">; seenMinute: number };

function isSavedLive(value: unknown): value is SavedLive {
  if (!isRecord(value) || typeof value.seenMinute !== "number" || !isRecord(value.day)) return false;
  const { decisions, matches, coachMatch, rest } = value.day;
  return isRecord(decisions) && Array.isArray(matches) && (coachMatch === null || isRecord(coachMatch)) && isRecord(rest);
}

export function writeSessionSave({ live, ...save }: SessionSave): string {
  const saved: SavedLive | null = live && {
    day: { decisions: live.day.decisions, matches: live.day.matches, coachMatch: live.day.coachMatch, rest: live.day.rest },
    seenMinute: live.seenMinute,
  };
  return JSON.stringify({ ...save, live: saved });
}

/**
 * Reads a save back. A save from before the session kept its own state is the bare game, read with
 * an empty desk and no turning point waiting; one from before it kept the live round has none under way.
 */
export function readSessionSave(json: string): SessionSave {
  const parsed: unknown = JSON.parse(json);
  if (!isRecord(parsed) || !("game" in parsed)) return { game: toGameState(parsed), desk: EMPTY_DESK, turningPoints: [], live: null };
  const { desk, turningPoints, live = null } = parsed;
  if (!isDesk(desk)) throw new Error("not a Boleiro save: its board desk is malformed");
  if (!isTurningPoints(turningPoints)) throw new Error("not a Boleiro save: its turning points are malformed");
  if (live !== null && !isSavedLive(live)) throw new Error("not a Boleiro save: its live round is malformed");
  const game = toGameState(parsed.game);
  return { game, desk, turningPoints, live: live && { day: { ...live.day, state: game }, seenMinute: live.seenMinute } };
}
