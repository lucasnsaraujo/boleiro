import { describe, expect, test } from "vitest";
import { positionFit, SECONDARY_POSITION } from "@boleiro/engine/engine/formations";
import { assistantOf, type Assistant, type AssistantLevel } from "@boleiro/engine/sim/coach/assistant";
import { weakestSpot } from "@boleiro/engine/sim/coach/assistantTips";
import type { GameState } from "@boleiro/engine/sim/gameState";
import { newGameFromFiles } from "@boleiro/engine/sim/loadNewGame";
import { bundledGameFiles } from "@boleiro/game-client/engine/bundledGameFiles";
import { signingSuggestions } from "./signingSuggestions.js";

const COACH = "flamengo-rj";
const game = newGameFromFiles(5, { coachClubId: COACH }, bundledGameFiles);
const tipOf = (state: GameState) => {
  const tip = weakestSpot(state, COACH, state.coach.tactics.formation, (_, strength) => strength);
  if (!tip) throw new Error("no tip for Flamengo");
  return tip;
};
const atLevel = (level: AssistantLevel): Assistant => ({ ...assistantOf(game), level });

describe("the assistant's signing suggestions", () => {
  const tip = tipOf(game);
  const { budget, rows } = signingSuggestions(game, atLevel(5), tip, new Set());

  test("are players for the weak position who would join and whose club asks no more than the transfer budget", () => {
    expect(rows.length).toBeGreaterThan(0);
    expect(budget).toBe(game.finances[COACH]?.transferBudget);
    for (const row of rows) {
      const player = game.players[row.id] ?? game.market.freeAgents[row.id];
      if (!player) throw new Error(`no player ${row.id}`);
      expect(player.clubId).not.toBe(COACH);
      expect(positionFit(player, tip.role)).toBeGreaterThanOrEqual(SECONDARY_POSITION);
      expect(row.willing).not.toBe("no");
      expect(row.price).not.toBeNull();
      expect(row.price ?? Infinity).toBeLessThanOrEqual(budget);
    }
  });

  test("from the best assistant, are all stronger than the starter they would replace, best first as he reads them", () => {
    for (const row of rows) expect(row.strength).toBeGreaterThan(tip.read);
    expect(rows.map((row) => row.read)).toEqual(rows.map((row) => row.read).toSorted((a, b) => b - a));
  });

  test("mark the players already on the watch list", () => {
    const [first] = rows;
    if (!first) throw new Error("no suggestion");
    const watched = signingSuggestions(game, atLevel(5), tip, new Set([first.id])).rows;
    expect(watched.find((row) => row.id === first.id)?.isWatched).toBe(true);
  });

  test("are none without a transfer budget for anyone but free agents", () => {
    const finance = game.finances[COACH];
    if (!finance) throw new Error("no finances");
    const broke = { ...game, finances: { ...game.finances, [COACH]: { ...finance, transferBudget: 0 } } };
    expect(signingSuggestions(broke, atLevel(5), tip, new Set()).rows.every((row) => row.price === 0)).toBe(true);
  });
});
