import { describe, expect, it } from "vitest";
import { chemistryWord, effectText, trendText } from "./chemistryText.js";

describe("chemistry text", () => {
  it("names the meter from bad to great", () => {
    expect([10, 35, 50, 71, 90].map(chemistryWord)).toEqual(["Ruim", "Fraco", "Regular", "Bom", "Ótimo"]);
  });

  it("says where the meter moved in the last match, and nothing when it stayed", () => {
    expect(trendText(71, 65)).toBe("subiu 6 desde o último jogo");
    expect(trendText(40, 43)).toBe("caiu 3 desde o último jogo");
    expect(trendText(50, 50)).toBeNull();
  });

  it("prints the strength effect with its sign, in Brazilian decimals", () => {
    expect(effectText(0.0126)).toBe("+1,3%");
    expect(effectText(-0.03)).toBe("−3%");
    expect(effectText(0.0001)).toBe("0%");
  });
});
