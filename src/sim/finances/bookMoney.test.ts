import { describe, expect, it } from "vitest";
import { advanceDay } from "../advanceDay.js";
import type { GameState } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { creditPrize } from "./creditPrize.js";
import { paySigningCosts } from "./paySigningCosts.js";
import { sellPlayer } from "./sellPlayer.js";

const start = loadNewGame(9, { coachClubId: "fortaleza-ce" });
const cashOf = (state: GameState, clubId: string) => state.finances[clubId]?.cash ?? Number.NaN;

function closingOf(state: GameState, clubId: string) {
  let current = state;
  while (!current.date.endsWith("-31")) current = advanceDay(current, {}).state;
  const closing = advanceDay(current, {}).events.find((e) => e.type === "monthClosed" && e.clubId === clubId);
  if (closing?.type !== "monthClosed") throw new Error("no closing");
  return closing;
}

describe("money booked between closings", () => {
  it("pays prize money into cash at once and shows it in the month's closing", () => {
    const paid = creditPrize(start, "fortaleza-ce", 2_000_000);
    expect(cashOf(paid, "fortaleza-ce") - cashOf(start, "fortaleza-ce")).toBe(2_000_000);
    expect(closingOf(paid, "fortaleza-ce").ledger.revenue.prizes).toBe(2_000_000);
  });

  it("moves a sold player and his fee between the two clubs", () => {
    const player = Object.values(start.players).find((p) => p.clubId === "fortaleza-ce");
    if (!player) throw new Error("no player");
    const sold = sellPlayer(start, { playerId: player.id, buyerId: "palmeiras-sp", fee: 10_000_000 });
    expect(sold.players[player.id]?.clubId).toBe("palmeiras-sp");
    expect(cashOf(sold, "fortaleza-ce") - cashOf(start, "fortaleza-ce")).toBe(10_000_000);
    expect(cashOf(start, "palmeiras-sp") - cashOf(sold, "palmeiras-sp")).toBe(10_000_000);
    expect(closingOf(sold, "palmeiras-sp").ledger.costs.transferFees).toBe(10_000_000);
    expect(closingOf(sold, "fortaleza-ce").ledger.revenue.playerSales).toBe(10_000_000);
  });

  it("removes a player sold abroad from the game", () => {
    const player = Object.values(start.players).find((p) => p.clubId === "fortaleza-ce");
    const sold = sellPlayer(start, { playerId: player?.id ?? "", buyerId: null, fee: 1 });
    expect(sold.players[player?.id ?? ""]).toBeUndefined();
  });

  it("charges the signing bonus and agent commission as separate costs", () => {
    const signed = paySigningCosts(start, "fortaleza-ce", { signingFee: 300_000, agentCommission: 50_000 });
    expect(cashOf(start, "fortaleza-ce") - cashOf(signed, "fortaleza-ce")).toBe(350_000);
    const { costs } = closingOf(signed, "fortaleza-ce").ledger;
    expect([costs.signingFees, costs.agentFees]).toEqual([300_000, 50_000]);
  });

  it("refuses negative amounts", () => {
    expect(() => creditPrize(start, "fortaleza-ce", -1)).toThrow();
  });
});
