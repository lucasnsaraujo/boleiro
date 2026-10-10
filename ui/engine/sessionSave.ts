import type { GameState } from "../../src/sim/gameState.js";
import { toGameState } from "../../src/sim/saveGame.js";
import type { TurningPoint } from "../hub/turningPoints.js";
import { EMPTY_DESK, type BoardDesk } from "../market/boardDesk.js";

/** What a save holds: the sim's game, plus the session's own state the sim does not keep. */
export type SessionSave = { game: GameState; desk: BoardDesk; turningPoints: TurningPoint[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDesk(value: unknown): value is BoardDesk {
  return isRecord(value) && Array.isArray(value.pending) && Array.isArray(value.answers) && Array.isArray(value.forcedSales);
}

function isTurningPoints(value: unknown): value is TurningPoint[] {
  return Array.isArray(value) && value.every((point) => isRecord(point) && (point.kind === "fired" || point.kind === "seasonEnd"));
}

export function writeSessionSave(save: SessionSave): string {
  return JSON.stringify(save);
}

/**
 * Reads a save back. A save from before the session kept its own state is the bare game, read with
 * an empty desk and no turning point waiting.
 */
export function readSessionSave(json: string): SessionSave {
  const parsed: unknown = JSON.parse(json);
  if (!isRecord(parsed) || !("game" in parsed)) return { game: toGameState(parsed), desk: EMPTY_DESK, turningPoints: [] };
  const { game, desk, turningPoints } = parsed;
  if (!isDesk(desk)) throw new Error("not a Boleiro save: its board desk is malformed");
  if (!isTurningPoints(turningPoints)) throw new Error("not a Boleiro save: its turning points are malformed");
  return { game: toGameState(game), desk, turningPoints };
}
