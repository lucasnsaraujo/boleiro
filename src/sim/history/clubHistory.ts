import type { Division } from "../../data/players.js";
import type { GameState } from "../gameState.js";
import { NO_RECORDS, type ClubRecords, type CompetitionKey, type PlayerAtClub } from "./history.js";

// guess: about three seasons as a regular (estadual, league and cup) or two seasons as the main striker
// make a player a club idol.
export const IDOL_APPS = 150;
export const IDOL_GOALS = 40;

export type ClubHistory = {
  titles: { season: number; competition: CompetitionKey }[];
  positions: { season: number; division: Division; position: number }[];
  records: ClubRecords;
  /** Most appearances first. */
  idols: (PlayerAtClub & { playerId: string })[];
};

const DIVISIONS: readonly Division[] = ["A", "B", "C", "D"];

/** One club's past as the history kept it: titles, league finishes, records and idols. */
export function clubHistory(state: Pick<GameState, "history">, clubId: string): ClubHistory {
  const { history } = state;
  const titles = history.seasons.flatMap((s) =>
    Object.entries(s.champions).flatMap(([competition, championId]) => (championId === clubId ? [{ season: s.season, competition }] : [])),
  );
  const positions = history.seasons.flatMap((s) =>
    DIVISIONS.flatMap((division) => {
      const position = s.tables[division].indexOf(clubId) + 1;
      return position ? [{ season: s.season, division, position }] : [];
    }),
  );
  const idols = Object.entries(history.players[clubId] ?? {})
    .filter(([, p]) => p.apps >= IDOL_APPS || p.goals >= IDOL_GOALS)
    .map(([playerId, p]) => ({ playerId, ...p }))
    .sort((a, b) => b.apps - a.apps || b.goals - a.goals);
  return { titles, positions, records: history.clubs[clubId] ?? NO_RECORDS, idols };
}
