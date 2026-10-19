import { standings, type StandingRow } from "@boleiro/engine/sim/standings";
import type { RoundTable } from "@boleiro/game-client/round/liveRoundOf";
import type { Score } from "./roundAt.js";

/** A table row as it stands right now; `move` is places gained (positive) or lost since kick-off. */
export type LiveTableRow = StandingRow & { position: number; move: number };

// The short table: the coach's club and the clubs around it.
const SHORT_TABLE_ROWS = 7;

/** The coach's group as if today's matches ended with `scores`, with each club's move since kick-off. */
export function liveTable(table: RoundTable, scores: ReadonlyMap<string, Score>): LiveTableRow[] {
  const before = standings(table.clubIds, table.fixtures, table.drawOrder).map((row) => row.clubId);
  const now = table.fixtures.map((f) => {
    const score = scores.get(f.id);
    return score && !f.result ? { ...f, result: { homeGoals: score.home, awayGoals: score.away } } : f;
  });
  return standings(table.clubIds, now, table.drawOrder).map((row, index) => ({ ...row, position: index + 1, move: before.indexOf(row.clubId) - index }));
}

/** `size` rows around the coach's club, seven unless asked: as many above as below, fewer at either end. */
export function shortTable(rows: readonly LiveTableRow[], coachClubId: string | null, size = SHORT_TABLE_ROWS): LiveTableRow[] {
  const at = Math.max(0, rows.findIndex((row) => row.clubId === coachClubId));
  const from = Math.max(0, Math.min(at - Math.floor(size / 2), rows.length - size));
  return rows.slice(from, from + size);
}
