import { describe, expect, it } from "vitest";
import { loadNewGame } from "../loadNewGame.js";
import { OPENING_EUR_BRL } from "../transfers/openingMarket.js";
import { loadSouthAmerica } from "../world/loadSouthAmerica.js";

describe("a game that plays CONMEBOL's cups", () => {
  const brazil = loadNewGame(8, { coachClubId: null });
  const southAmerica = loadNewGame(8, { coachClubId: null, world: loadSouthAmerica(2026) });
  const finance = (game: typeof brazil, id: string) => {
    const found = game.finances[id];
    if (!found) throw new Error(`no finances for ${id}`);
    return found;
  };
  const brl = (usd: number) => Math.round(usd * brazil.economy.continental.usdBrl * (brazil.market.eurBrl / OPENING_EUR_BRL));

  it("takes a Libertadores club's group-stage prize out of the other income it opens with, as the board expects it from the cup", () => {
    const prize = brl(brazil.economy.continental.libertadoresGroups);
    const [without, withCups] = [finance(brazil, "palmeiras-sp"), finance(southAmerica, "palmeiras-sp")];
    expect(withCups.expectedPrizes - without.expectedPrizes).toBe(prize);
    expect(without.otherIncome - withCups.otherIncome).toBe(prize);
    expect(withCups.otherIncome + withCups.prizesOutOfOtherIncome).toBe(without.otherIncome + without.prizesOutOfOtherIncome);
  });

  it("leaves the money of a club in no cup as it was", () => {
    expect(finance(southAmerica, "remo-pa")).toEqual(finance(brazil, "remo-pa"));
  });
});
