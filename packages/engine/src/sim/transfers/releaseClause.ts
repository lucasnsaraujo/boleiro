import type { SimPlayer } from "../gameState.js";

// Lei 14.597/2023 (Lei Geral do Esporte) art. 86: the cláusula indenizatória esportiva is capped at 2,000
// times the average contract wage for a move inside Brazil, and uncapped for a move abroad.
// guess: every club writes the cap, the usual way to keep rivals off its players.
const CLAUSE_WAGES = 2000;

/** What another Brazilian club pays, in BRL, to take him without his club's say: the board can't refuse it, only he can. */
export const releaseClauseOf = (player: Pick<SimPlayer, "wage">): number => CLAUSE_WAGES * player.wage;
