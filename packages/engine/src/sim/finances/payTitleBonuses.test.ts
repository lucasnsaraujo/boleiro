import { describe, expect, it } from "vitest";
import type { GameState } from "../gameState.js";
import { competitionKey } from "../history/history.js";
import { loadNewGame } from "../loadNewGame.js";
import { wageBillsOf } from "../transfers/wageBillsOf.js";
import { payTitleBonuses } from "./payTitleBonuses.js";

const start = loadNewGame(5, { coachClubId: "bahia-ba" });

function crowned(state: GameState, kind: "league" | "state" | "cup", clubId: string): { state: GameState; competitionId: string } {
  const competition = Object.values(state.competitions).find((c) => c.kind === kind && c.clubIds.includes(clubId));
  if (!competition) throw new Error(`${clubId} plays no ${kind}`);
  const champions = { ...state.history.current.champions, [competitionKey(competition.id)]: clubId };
  return { state: { ...state, history: { ...state.history, current: { ...state.history.current, champions } } }, competitionId: competition.id };
}

const bonusesOf = (state: GameState, clubId: string) => state.finances[clubId]?.month.costs.bonuses ?? 0;

describe("title bonuses", () => {
  it("pay a new champion's squad a month of wages for a national title", () => {
    const { state: after, competitionId } = crowned(start, "league", "bahia-ba");
    const paid = payTitleBonuses(start, after);
    const wages = wageBillsOf(start).get("bahia-ba") ?? 0;
    expect(bonusesOf(paid.state, "bahia-ba")).toBe(wages);
    expect(paid.state.finances["bahia-ba"]?.cash).toBe((start.finances["bahia-ba"]?.cash ?? 0) - wages);
    expect(paid.events).toEqual([{ type: "titleBonusPaid", clubId: "bahia-ba", competitionId, amount: wages }]);
  });

  it("pay half a month for a state title", () => {
    const { state: after } = crowned(start, "state", "bahia-ba");
    const wages = wageBillsOf(start).get("bahia-ba") ?? 0;
    expect(bonusesOf(payTitleBonuses(start, after).state, "bahia-ba")).toBe(Math.round(wages / 2));
  });

  it("pay nothing for a title already won before today", () => {
    const { state: won } = crowned(start, "league", "bahia-ba");
    expect(payTitleBonuses(won, won)).toEqual({ state: won, events: [] });
  });
});
