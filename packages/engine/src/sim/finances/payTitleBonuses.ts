import type { Competition, GameState } from "../gameState.js";
import { competitionKey } from "../history/history.js";
import { wageBillsOf } from "../transfers/wageBillsOf.js";
import { bookMoney } from "./bookMoney.js";

export type TitleBonusPaid = { type: "titleBonusPaid"; clubId: string; competitionId: string; amount: number };

// guess: Brazilian clubs pay squads a "bicho" for a title; a month of the wage bill for a national
// league, the Copa do Brasil or a CONMEBOL cup, half for a state title. No club publishes its bonus table.
const MONTHS_OF_WAGES: Record<Competition["kind"], number> = { league: 1, cup: 1, state: 0.5, continental: 1 };

/** Every club crowned between `before` and `after` pays its squad's title bonus, booked as bonuses. */
export function payTitleBonuses(before: GameState, after: GameState): { state: GameState; events: TitleBonusPaid[] } {
  const was = before.history.current.champions;
  const crowned = Object.entries(after.history.current.champions).filter(([key, clubId]) => was[key] !== clubId);
  if (!crowned.length) return { state: after, events: [] };
  const wages = wageBillsOf(after);
  const events: TitleBonusPaid[] = [];
  let state = after;
  for (const [key, clubId] of crowned) {
    const competition = Object.values(after.competitions).find((c) => competitionKey(c.id) === key);
    const amount = competition ? Math.round(MONTHS_OF_WAGES[competition.kind] * (wages.get(clubId) ?? 0)) : 0;
    if (!competition || amount <= 0 || !state.finances[clubId]) continue;
    state = bookMoney(state, clubId, { cost: "bonuses", amount });
    events.push({ type: "titleBonusPaid", clubId, competitionId: competition.id, amount });
  }
  return { state, events };
}
