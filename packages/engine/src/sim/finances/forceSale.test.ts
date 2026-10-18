import { describe, expect, it } from "vitest";
import { pickLineup } from "../../engine/match.js";
import { seededRandom } from "../../engine/random.js";
import type { GameState } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { marketView } from "../transfers/marketView.js";
import { openDraft } from "../transfers/movePlayer.js";
import { REPLACEMENT_BAND, squadNeeds } from "../transfers/squadNeeds.js";
import { forceSale } from "./forceSale.js";

const COACH = "flamengo-rj";
const start = loadNewGame(5, { coachClubId: COACH });
const sellerId = Object.values(start.clubs).find((c) => c.division === "D")?.id ?? "";
const squad = Object.values(start.players).filter((p) => p.clubId === sellerId);
const keyPlayers = new Set(pickLineup(squad));
const [firstChoice] = squad.filter((p) => !keyPlayers.has(p)).sort((a, b) => b.wage - a.wage || a.id.localeCompare(b.id));
if (!firstChoice) throw new Error("no player to sell");
const sell = (state: GameState) => {
  const draft = openDraft(state);
  return forceSale(draft, sellerId, seededRandom(1), marketView(draft));
};

describe("the board's forced sale", () => {
  it("never sells a player the club only has on loan", () => {
    const loan = { fromClubId: "palmeiras-sp", until: "2026-06-30", lenderWageShare: 0.5, buyOption: null };
    const lentIn: GameState = { ...start, market: { ...start.market, loans: { ...start.market.loans, [firstChoice.id]: loan } } };
    const sold = sell(lentIn);
    expect(sold?.sale.playerId).toBeDefined();
    expect(sold?.sale.playerId).not.toBe(firstChoice.id);
    expect(sold?.state.market.loans[firstChoice.id]).toEqual(loan);
  });

  it("sells only to a club he would be a replacement for, never far below the middle of its squad", () => {
    const sales = Array.from({ length: 40 }, (_, seed) => {
      const draft = openDraft(start);
      const view = marketView(draft);
      const sold = forceSale(draft, sellerId, seededRandom(seed + 1), view);
      return sold?.sale.buyerId ? { buyerLevel: squadNeeds(marketView(start).squad(sold.sale.buyerId), view.tier(sold.sale.buyerId)).middle, strength: start.players[sold.sale.playerId]?.strength ?? 0 } : null;
    }).filter((sale) => sale !== null);
    expect(sales.length).toBeGreaterThan(0);
    for (const { buyerLevel, strength } of sales) expect(strength).toBeGreaterThanOrEqual(buyerLevel - REPLACEMENT_BAND.below);
  });

  it("never sells to the coach's club, which only buys through the coach's requests", () => {
    const onlyCoachCanPay: GameState = {
      ...start,
      finances: Object.fromEntries(Object.entries(start.finances).map(([id, f]) => [id, { ...f, cash: id === COACH ? 1e12 : 0 }])),
    };
    const sold = sell(onlyCoachCanPay);
    expect(sold?.sale.playerId).toBe(firstChoice.id);
    expect(sold?.sale.buyerId).toBeNull();
  });
});
