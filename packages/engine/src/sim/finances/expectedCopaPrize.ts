import type { Economy } from "../gameState.js";

// guess: every tie a coin flip, so a club reaches each further stage half as often as the one before.
export const TIE_WIN_CHANCE = 0.5;

/** Copa do Brasil prize money a club entering at `entryStage` can expect on average. */
export function expectedCopaPrize({ stagePrizes, runnerUp, champion }: Economy["copaDoBrasil"], entryStage: number, lowerDivision: boolean): number {
  let expected = 0;
  let reach = 1;
  for (const { prize, prizeLowerDivisions } of stagePrizes.slice(entryStage)) {
    expected += reach * (lowerDivision ? (prizeLowerDivisions ?? prize) : prize);
    reach *= TIE_WIN_CHANCE;
  }
  return expected + reach * (TIE_WIN_CHANCE * champion + (1 - TIE_WIN_CHANCE) * runnerUp);
}
