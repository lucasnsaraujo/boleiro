import { loadPack } from "@boleiro/data/dataPack";
import { loadWorldPack } from "@boleiro/data/worldPack";
import { describe, expect, it } from "vitest";
import { strengthFromValue, YARDSTICK } from "./strengthYardstick.js";

/** Least-squares line of Brazil's ratings on the log market value of the same players in the world scrape's Brazil pack. */
function fitOnBrazil() {
  const pack = loadPack();
  const values = new Map(loadWorldPack("br").players.flatMap((p) => (p.marketValueEur ? [[`${p.clubId}/${p.name}`, p.marketValueEur] as const] : [])));
  const pairs = pack.players.flatMap((p) => {
    const value = values.get(`${p.clubId}/${p.name}`);
    return value ? [[Math.log(value), p.strength] as const] : [];
  });
  const meanX = pairs.reduce((sum, [x]) => sum + x, 0) / pairs.length;
  const meanY = pairs.reduce((sum, [, y]) => sum + y, 0) / pairs.length;
  const slope = pairs.reduce((sum, [x, y]) => sum + (x - meanX) * (y - meanY), 0) / pairs.reduce((sum, [x]) => sum + (x - meanX) ** 2, 0);
  return { pairs: pairs.length, intercept: meanY - slope * meanX, slope };
}

describe("the strength yardstick", () => {
  it("is the line Brazil's own ratings draw against Transfermarkt's market values", () => {
    const fit = fitOnBrazil();
    expect(fit.pairs).toBeGreaterThan(1_000);
    expect(fit.slope).toBeCloseTo(YARDSTICK.slope, 2);
    expect(fit.intercept).toBeCloseTo(YARDSTICK.intercept, 1);
  });

  it("rates a dearer player stronger, within the game's 30 to 95", () => {
    expect(strengthFromValue(10_000_000)).toBeGreaterThan(strengthFromValue(1_000_000));
    expect(strengthFromValue(1)).toBe(30);
    expect(strengthFromValue(10 ** 12)).toBe(95);
  });
});
