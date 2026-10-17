import { withReplacedPlayers } from "../players/squadsByClub.js";
import { addDays } from "../dates.js";
import { bookMoney } from "../finances/bookMoney.js";
import type { GameState, IsoDate } from "../gameState.js";
import { clubMood } from "../morale/clubMood.js";
import { CLASH_HEAT, recordPressClash } from "../rivalries/coachRivalries.js";
import { eventMemoryOf, rivalryKey, type Cast, type Effects } from "./eventMemory.js";

// The board's meter is half full on target and empties as its pressure grows by 2 (hubSelectors' boardConfidence),
// so a meter point is a fiftieth of pressure.
const BOARD_POINT = 1 / 50;
// judgeCoaches keeps the pressure inside this range.
const PRESSURE_RANGE = { min: -1, max: 2 };

const meter = (value: number) => Math.min(100, Math.max(0, value));

/** The game after an event's effects land on `clubId`: its mood, board, cash, a player out, the rivalry's heat and, for a provocation, a clash with the rival's coach. */
export function applyEffects(state: GameState, clubId: string, cast: Cast, effects: Effects, date: IsoDate): GameState {
  let next = state;
  if (effects.morale || effects.fans) {
    const mood = clubMood(next, clubId);
    next = { ...next, mood: { ...next.mood, [clubId]: { ...mood, squad: meter(mood.squad + (effects.morale ?? 0)), fans: meter(mood.fans + (effects.fans ?? 0)) } } };
  }
  const board = next.boards[clubId];
  if (effects.board && board) {
    const pressure = Math.min(PRESSURE_RANGE.max, Math.max(PRESSURE_RANGE.min, board.pressure - effects.board * BOARD_POINT));
    next = { ...next, boards: { ...next.boards, [clubId]: { ...board, pressure } } };
  }
  if (effects.money && next.finances[clubId]) {
    const amount = Math.abs(effects.money);
    next = bookMoney(next, clubId, effects.money > 0 ? { revenue: "otherIncome", amount } : { cost: "bonuses", amount });
  }
  const player = cast.playerId ? next.players[cast.playerId] : undefined;
  if (effects.outDays && player) {
    const until = addDays(date, effects.outDays + 1);
    const { injuredUntil } = player.condition;
    if (!injuredUntil || injuredUntil < until) {
      next = { ...next, players: withReplacedPlayers(next.players, [{ ...player, condition: { ...player.condition, injuredUntil: until } }]) };
    }
  }
  if (effects.rivalry && cast.rivalId) {
    const memory = eventMemoryOf(next);
    const key = rivalryKey(clubId, cast.rivalId);
    next = { ...next, eventMemory: { ...memory, rivalry: { ...memory.rivalry, [key]: Math.max(0, (memory.rivalry[key] ?? 0) + effects.rivalry) } } };
    if (effects.rivalry >= CLASH_HEAT) next = recordPressClash(next, clubId, cast.rivalId);
  }
  return next;
}
