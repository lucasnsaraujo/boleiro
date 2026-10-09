import type { Fixture, GameState, IsoDate } from "../gameState.js";
import { clubMood, type SupporterStep } from "../morale/clubMood.js";
import type { Board } from "./boardExpectations.js";
import { firstPhaseTables } from "./firstPhaseTables.js";

export type CoachFired = {
  type: "coachFired";
  clubId: string;
  date: IsoDate;
  /** True when the board fired the player's coach. */
  isYou: boolean;
  position: number;
  targetPosition: number;
};

// guess: how much of the old pressure each league game keeps; the last four or five games weigh most.
const PRESSURE_MEMORY = 0.75;
// The gap to target counts in quarters of the table, so 5 places short in a 20-club league is 1.
export const GAP_SCALE = 4;
const GAP_RANGE = { min: -1, max: 2 };
// guess: a new coach gets four league games before the board judges him.
const GRACE_GAMES = 4;
// guess: fans at 0 add as much pressure as being 1.5 places short in a 20-club table.
const UNHAPPY_FANS = 0.3;
// guess: what organised supporters add on top of fan mood; protests at the training ground count most.
const SUPPORTER_PRESSURE: Record<SupporterStep, number> = { calm: 0, pressure: 0.1, protest: 0.3, violence: 0.5 };
// Calibrated so Série A sees about 20 firings over its 38 rounds: Band counted 22 coach changes in the
// 2025 Brasileirão with two rounds left and 17 in 2024
// (https://www.band.com.br/esportes/veja-os-tecnicos-que-nao-foram-mandados-embora-no-brasileirao-202512021424).
const FIRING_LINE = 0.8;
const FIRING_CHANCE_PER_GAME = 0.25;

const clamp = (value: number) => Math.min(GAP_RANGE.max, Math.max(GAP_RANGE.min, value));

/** Pressure from the stands: unhappy fans and escalating organised supporters. */
function crowdPressure(state: GameState, clubId: string): number {
  const mood = clubMood(state, clubId);
  return (UNHAPPY_FANS * Math.max(0, 50 - mood.fans)) / 50 + SUPPORTER_PRESSURE[mood.supporters];
}

/** The board's verdict after a league game: the new pressure and whether the coach goes. */
function judge(state: GameState, board: Board, position: number, clubId: string, random: () => number): { board: Board; fired: boolean } {
  const gap = clamp((GAP_SCALE * (position - board.targetPosition)) / board.tableSize);
  const judged = { ...board, position, games: board.games + 1, pressure: PRESSURE_MEMORY * board.pressure + (1 - PRESSURE_MEMORY) * gap };
  const fired = judged.games >= GRACE_GAMES && judged.pressure + crowdPressure(state, clubId) > FIRING_LINE && random() < FIRING_CHANCE_PER_GAME;
  return { board: fired ? { ...judged, games: 0, pressure: 0 } : judged, fired };
}

/**
 * After each league first-phase game, every board weighs its table position against the target and the
 * mood in the stands, and may fire its coach. AI clubs replace theirs at once; the player's coach loses his job.
 */
export function judgeCoaches(state: GameState, played: readonly Fixture[], random: () => number): { state: GameState; events: CoachFired[]; vacancies: string[] } {
  const league = played.filter((f) => f.stage === 0 && state.competitions[f.competitionId]?.kind === "league");
  if (!league.length) return { state, events: [], vacancies: [] };
  const tables = firstPhaseTables(state, new Set(league.map((f) => f.competitionId)));
  const boards = { ...state.boards };
  const events: CoachFired[] = [];
  const vacancies: string[] = [];
  let coachClubId = state.coachClubId;
  for (const clubId of league.flatMap((f) => [f.homeId, f.awayId]).sort()) {
    const board = boards[clubId];
    const position = (tables.get(clubId)?.indexOf(clubId) ?? -1) + 1;
    if (!board || !position) continue;
    const verdict = judge(state, board, position, clubId, random);
    boards[clubId] = verdict.board;
    if (!verdict.fired) continue;
    const isYou = clubId === state.coachClubId;
    events.push({ type: "coachFired", clubId, date: state.date, isYou, position, targetPosition: board.targetPosition });
    if (isYou) coachClubId = null;
    else vacancies.push(clubId);
  }
  return { state: { ...state, boards, coachClubId }, events, vacancies };
}
