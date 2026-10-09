import type { GameState } from "../gameState.js";
import { bookMoney } from "./bookMoney.js";

/** Pays a club prize money (Copa do Brasil rounds, continental qualification) into cash now. */
export function creditPrize(state: GameState, clubId: string, amount: number): GameState {
  return bookMoney(state, clubId, { revenue: "prizes", amount });
}
