import type { GameState } from "@boleiro/engine/sim/gameState";
import type { LiveDay } from "@boleiro/engine/sim/live/liveDay";
import { toGameState } from "@boleiro/engine/sim/saveGame";
import { COUNTRY_SHARD, loadShards, saveShards } from "@boleiro/engine/sim/saveShards";
import type { TurningPoint } from "../hub/turningPoints.js";
import { EMPTY_DESK, type BoardDesk } from "../market/boardDesk.js";

/** A match day under way and the furthest minute the screen has shown of it. */
export type LiveRoundSave = { day: LiveDay; seenMinute: number };
/** What a save holds: the sim's game, plus the session's own state the sim does not keep. */
export type SessionSave = { game: GameState; desk: BoardDesk; turningPoints: TurningPoint[]; live: LiveRoundSave | null };

/** A save split into parts written apart, by name: the game's shards and the session's own state. */
export type SaveShards = Readonly<Record<string, string>>;
/** A save as a slot holds it: its shards, or one string for a save written whole, as before shards. */
export type StoredSave = string | SaveShards;
/** A game as last split into shards, so the next split reuses the shard of every country that is still the same object. */
export type SplitGame = { game: GameState; shards: SaveShards };

/** The desk, turning points and live round: everything a save holds besides the game. */
const SESSION_SHARD = "session";

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

function sessionPartsOf({ desk, turningPoints, live }: Omit<SessionSave, "game">) {
  const saved: SavedLive | null = live && {
    day: { decisions: live.day.decisions, matches: live.day.matches, coachMatch: live.day.coachMatch, rest: live.day.rest },
    seenMinute: live.seenMinute,
  };
  return { desk, turningPoints, live: saved };
}

export function writeSessionSave({ game, ...session }: SessionSave): string {
  return JSON.stringify({ game, ...sessionPartsOf(session) });
}

/** The game's shards; a country that is the same object as when `last` was split keeps its shard from then. */
export function splitGame(game: GameState, last: SplitGame | null): SplitGame {
  if (last?.game === game) return last;
  const shards = saveShards(game, last?.game);
  for (const id of Object.keys(game.world ?? {})) {
    const key = `${COUNTRY_SHARD}${id}`;
    const kept = shards[key] ?? last?.shards[key];
    if (kept === undefined) throw new Error(`country ${id} has no shard to keep from the last save`);
    shards[key] = kept;
  }
  return { game, shards };
}

/** The save in shards: the game's, from `split`, and one for the rest of the session. */
export function writeSessionShards(split: SplitGame, session: Omit<SessionSave, "game">): SaveShards {
  return { ...split.shards, [SESSION_SHARD]: JSON.stringify(sessionPartsOf(session)) };
}

function withSessionParts(parts: Record<string, unknown>, game: GameState): SessionSave {
  const { desk, turningPoints, live = null } = parts;
  if (!isDesk(desk)) throw new Error("not a Boleiro save: its board desk is malformed");
  if (!isTurningPoints(turningPoints)) throw new Error("not a Boleiro save: its turning points are malformed");
  if (live !== null && !isSavedLive(live)) throw new Error("not a Boleiro save: its live round is malformed");
  return { game, desk, turningPoints, live: live && { day: { ...live.day, state: game }, seenMinute: live.seenMinute } };
}

/**
 * Reads a save written whole back. One from before the session kept its own state is the bare game, read with
 * an empty desk and no turning point waiting; one from before it kept the live round has none under way.
 */
function readSessionSave(json: string): SessionSave {
  const parsed: unknown = JSON.parse(json);
  if (!isRecord(parsed) || !("game" in parsed)) return { game: toGameState(parsed), desk: EMPTY_DESK, turningPoints: [], live: null };
  return withSessionParts(parsed, toGameState(parsed.game));
}

/** Reads a save back, from its shards or written whole. */
export function readStoredSave(save: StoredSave): SessionSave {
  if (typeof save === "string") return readSessionSave(save);
  const session = save[SESSION_SHARD];
  if (session === undefined) throw new Error("not a Boleiro save: it has no session shard");
  const parts: unknown = JSON.parse(session);
  if (!isRecord(parts)) throw new Error("not a Boleiro save: its session shard is malformed");
  return withSessionParts(parts, loadShards(save));
}
