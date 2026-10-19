import type { Fixture, GameState } from "@boleiro/engine/sim/gameState";
import { matchOfficials } from "@boleiro/engine/sim/referees/matchOfficials";

/**
 * Who referees a match as the screens name it: the real referee, null where the data names none, his
 * yellow cards per match when the data has his stats, and whether VAR watches.
 */
export type Officials = { referee: string | null; yellowsPerMatch?: number; hasVar: boolean };

const NONE: Officials = { referee: null, hasVar: false };

/** The officials of a fixture of the game's competitions; a match of a league played result-only has none on record. */
export function officialsOf(state: Pick<GameState, "seed" | "competitions">, fixture: Fixture | undefined): Officials {
  const competition = fixture && state.competitions[fixture.competitionId];
  if (!fixture || !competition) return NONE;
  const officials = matchOfficials(state.seed, competition, fixture);
  const { referee } = officials;
  return { referee: referee?.name ?? null, ...(referee?.yellowsPerMatch ? { yellowsPerMatch: referee.yellowsPerMatch } : {}), hasVar: officials.var !== null };
}
