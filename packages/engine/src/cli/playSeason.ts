import { advanceDay } from "../sim/advanceDay.js";
import type { Fixture, GameState } from "../sim/gameState.js";
import { transfersOf, type PaidMove } from "../sim/history/transfersOf.js";
import type { PlayerInjured } from "../sim/players/recordMatchLoad.js";
import type { PlayerMoved } from "../sim/transfers/transferEvents.js";

export type SeasonPlay = {
  /** The season's last day, before the rollover. */
  before: GameState;
  /** The first day of the next season. */
  after: GameState;
  fixtures: Fixture[];
  injuries: PlayerInjured[];
  transfers: PaidMove[];
  moves: PlayerMoved[];
};

/** Plays the current season to its end with no human decisions. */
export function playSeason(start: GameState): SeasonPlay {
  let state = start;
  const fixtures: Fixture[] = [];
  const injuries: PlayerInjured[] = [];
  const transfers: PaidMove[] = [];
  const moves: PlayerMoved[] = [];
  for (;;) {
    const day = advanceDay(state, {});
    for (const event of day.events) {
      if (event.type === "matchPlayed") fixtures.push(event.fixture);
      if (event.type === "playerInjured") injuries.push(event);
      if (event.type === "playerMoved") moves.push(event);
    }
    transfers.push(...transfersOf(day.events, state));
    if (day.events.some((e) => e.type === "seasonEnded")) return { before: state, after: day.state, fixtures, injuries, transfers, moves };
    state = day.state;
  }
}
