import { FIRST_PACK_VERSION } from "@boleiro/data/dataPack";
import { withEveryLine } from "./finances/ledger.js";
import type { ClubFinance, GameState } from "./gameState.js";
import type { History, StrengthMark } from "./history/history.js";

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

/**
 * A player's strength marks as a save writes them: the first season, then his strength each season on, null
 * for a season he had none (a spell without a club). The marks are a save's biggest part, one per player and
 * season, and a line takes less than half the room of the marks written one by one.
 */
type StrengthLine = [number, ...(number | null)[]];

function lineOf(marks: readonly StrengthMark[]): StrengthLine | null {
  const [first] = marks;
  if (!first) return null;
  const line: StrengthLine = [first.season];
  let season = first.season;
  for (const mark of marks) {
    // Marks out of season order (none the game writes) stay as they are.
    if (mark.season < season) return null;
    for (; season < mark.season; season++) line.push(null);
    line.push(mark.strength);
    season++;
  }
  return line;
}

/** The history as a save writes it, each player's strength marks as one line. */
type SavedHistory = Omit<History, "strength"> & { strength: Record<string, StrengthLine | readonly StrengthMark[]> };

/** The game as a save writes it: each player's strength marks as one line (`StrengthLine`). */
export function withStrengthLines<T extends Pick<GameState, "history">>(state: T): Omit<T, "history"> & { history: SavedHistory } {
  const strength: SavedHistory["strength"] = {};
  for (const [playerId, marks] of Object.entries(state.history.strength)) strength[playerId] = lineOf(marks) ?? marks;
  return { ...state, history: { ...state.history, strength } };
}

const isStrengthLine = (value: readonly unknown[]): value is StrengthLine =>
  typeof value[0] === "number" && value.every((item) => item === null || typeof item === "number");

/** Each player's strength marks read back from a save: from a line, or as written before lines. */
function withStrengthMarks(state: GameState): GameState {
  const strength: History["strength"] = {};
  for (const [playerId, saved] of Object.entries(state.history.strength)) {
    const written: readonly unknown[] = saved;
    if (!isStrengthLine(written)) {
      strength[playerId] = saved;
      continue;
    }
    const [first, ...strengths] = written;
    strength[playerId] = strengths.flatMap((value, at) => (value === null ? [] : [{ season: first + at, strength: value }]));
  }
  return { ...state, history: { ...state.history, strength } };
}

export function saveGame(state: GameState): string {
  return JSON.stringify(withStrengthLines(state));
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
  const game = withEveryClubLedgerLine(withStrengthMarks(parsed));
  if (typeof game.packVersion === "string") return game;
  // Assigned onto the leading keys, so the save re-serialises in a new game's key order, then over
  // any packVersion that isn't text.
  return Object.assign({ version: game.version, packVersion: FIRST_PACK_VERSION }, game, { packVersion: FIRST_PACK_VERSION });
}

export function loadGame(json: string): GameState {
  return toGameState(JSON.parse(json));
}
