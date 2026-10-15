import { FIRST_PACK_VERSION } from "@boleiro/data/dataPack";
import { withEveryLine } from "./finances/ledger.js";
import type { ClubFinance, GameState } from "./gameState.js";

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

/** The club's books with every ledger line; a save from before friendlies and title bonuses lacks theirs. */
function withEveryLedgerLine(finance: ClubFinance): ClubFinance {
  const month = withEveryLine(finance.month);
  const season = withEveryLine(finance.season);
  const lastSeason = finance.lastSeason && withEveryLine(finance.lastSeason);
  const lastClosing = finance.lastClosing && { ...finance.lastClosing, ledger: withEveryLine(finance.lastClosing.ledger) };
  const isComplete = month === finance.month && season === finance.season && lastSeason === finance.lastSeason && lastClosing?.ledger === finance.lastClosing?.ledger;
  return isComplete ? finance : { ...finance, month: { ...finance.month, ...month }, season, lastSeason, lastClosing };
}

function withEveryClubLedgerLine(state: GameState): GameState {
  const finances = Object.fromEntries(Object.entries(state.finances).map(([id, finance]) => [id, withEveryLedgerLine(finance)]));
  return Object.keys(finances).some((id) => finances[id] !== state.finances[id]) ? { ...state, finances } : state;
}

/**
 * A parsed save checked as a game of this version; throws otherwise. A save from before data
 * packs has no `packVersion` and started from the first Brazil pack.
 */
export function toGameState(parsed: unknown): GameState {
  if (!isGameState(parsed)) throw new Error(`not a version ${SAVE_VERSION} Boleiro save`);
  const game = withEveryClubLedgerLine(parsed);
  if (typeof game.packVersion === "string") return game;
  // Assigned onto the leading keys, so the save re-serialises in a new game's key order, then over
  // any packVersion that isn't text.
  return Object.assign({ version: game.version, packVersion: FIRST_PACK_VERSION }, game, { packVersion: FIRST_PACK_VERSION });
}

export function loadGame(json: string): GameState {
  return toGameState(JSON.parse(json));
}
