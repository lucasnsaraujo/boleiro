import type { GameState } from "../gameState.js";
import { bookMoney } from "./bookMoney.js";

/** Pays a club Copa do Brasil prize money into cash now; continental money comes at the season turn (renewFinances). */
export function creditPrize(state: GameState, clubId: string, amount: number): GameState {
  return bookMoney(state, clubId, { revenue: "prizes", amount });
}
