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

/** A parsed save checked as a game of this version; throws otherwise. */
export function toGameState(parsed: unknown): GameState {
  if (!isGameState(parsed)) throw new Error(`not a version ${SAVE_VERSION} Boleiro save`);
  return parsed;
}

export function loadGame(json: string): GameState {
  return toGameState(JSON.parse(json));
}
