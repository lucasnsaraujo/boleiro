import { FIRST_PACK_VERSION } from "@boleiro/data/dataPack";
import type { GameState } from "./gameState.js";

const SAVE_VERSION: GameState["version"] = 4;
const REQUIRED_KEYS: readonly (keyof GameState)[] = [
  "seed", "rngState", "date", "season", "coachClubId", "clubs", "players", "calendar", "competitions", "fixtures",
  "economy", "finances", "mood", "coach", "boards", "discipline", "history", "market",
];

function isGameState(value: unknown): value is GameState {
  return (
    typeof value === "object" &&
    value !== null &&
    "version" in value &&
    value.version === SAVE_VERSION &&
    REQUIRED_KEYS.every((key) => key in value)
  );
}

export function saveGame(state: GameState): string {
  return JSON.stringify(state);
}

/**
 * A parsed save checked as a game of this version; throws otherwise. A save from before data
 * packs has no `packVersion` and started from the first Brazil pack.
 */
export function toGameState(parsed: unknown): GameState {
  if (!isGameState(parsed)) throw new Error(`not a version ${SAVE_VERSION} Boleiro save`);
  return typeof parsed.packVersion === "string" ? parsed : { ...parsed, packVersion: FIRST_PACK_VERSION };
}

export function loadGame(json: string): GameState {
  return toGameState(JSON.parse(json));
}
