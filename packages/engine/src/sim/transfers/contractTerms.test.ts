import { describe, expect, it } from "vitest";
import type { SimPlayer } from "../gameState.js";
import { assistantPick, CONTRACT_MONTHS, contractEndAfter, contractTerms, NEUTRAL_TALKS, preferredMonths, type ContractTerm } from "./contractTerms.js";

type Talker = Pick<SimPlayer, "id" | "age" | "wage" | "strength">;
const player = (id: string, age: number, strength: number, wage = 100_000): Talker => ({ id, age, strength, wage });
const squad = [player("a", 30, 80), player("b", 28, 78), player("c", 26, 76), player("d", 24, 70), player("e", 21, 64), player("f", 33, 68)];
const byMonths = (terms: readonly ContractTerm[]) => Object.fromEntries(terms.map((term) => [term.months, term]));

describe("contractEndAfter", () => {
  it("ends a deal on the 30 June or 31 December nearest to its length", () => {
    expect(contractEndAfter("2026-01-10", 6)).toBe("2026-06-30");
    expect(contractEndAfter("2026-01-10", 12)).toBe("2026-12-31");
    expect(contractEndAfter("2026-07-25", 12)).toBe("2027-06-30");
    expect(contractEndAfter("2026-10-18", 6)).toBe("2027-06-30");
  });

  it("extends a December contract by whole seasons", () => {
    expect(contractEndAfter("2027-12-31", 24)).toBe("2029-12-31");
    expect(contractEndAfter("2026-12-31", 6)).toBe("2027-06-30");
  });

  it("never ends a deal on or before the day it starts", () => {
    expect(contractEndAfter("2026-12-31", 0)).toBe("2027-06-30");
  });
});

describe("preferredMonths", () => {
  it("has older players wanting longer deals, up to three years", () => {
    expect(preferredMonths(player("x", 22, 60), squad)).toBeLessThan(preferredMonths(player("y", 27, 60), squad));
    expect(preferredMonths(player("z", 29, 60), squad)).toBe(36);
    expect(preferredMonths(player("w", 34, 60), squad)).toBe(36);
  });

  it("has a young star wanting a short deal, to move up soon", () => {
    expect(preferredMonths(player("star", 22, 79), squad)).toBe(12);
    expect(preferredMonths(player("star", 22, 79), squad)).toBeLessThan(preferredMonths(player("reserve", 24, 60), squad));
  });
});

describe("contractTerms", () => {
  const terms = byMonths(contractTerms(300_000, 36, NEUTRAL_TALKS));

  it("offers every length from six months to five years", () => {
    expect(contractTerms(300_000, 36, NEUTRAL_TALKS).map((term) => term.months)).toEqual([...CONTRACT_MONTHS]);
  });

  it("asks the anchor wage for the length he wants and more the further a length is from it", () => {
    expect(terms[36]?.wage).toBe(300_000);
    expect(terms[24]?.wage).toBeGreaterThan(300_000);
    expect(terms[12]?.wage).toBeGreaterThan(terms[24]?.wage ?? Infinity);
    expect(terms[6]?.wage).toBeGreaterThan(terms[12]?.wage ?? Infinity);
    expect(terms[48]?.wage).toBe(terms[24]?.wage);
  });

  it("wants his length, agrees a year either side, finds two years off hard and refuses beyond", () => {
    expect([6, 12, 24, 36, 48, 60].map((months) => terms[months]?.stance)).toEqual(["refuses", "hard", "agrees", "wants", "agrees", "hard"]);
  });

  it("is a step harder and dearer when he asked to leave or has an offer waiting", () => {
    for (const mood of [{ ...NEUTRAL_TALKS, hasAskedToLeave: true }, { ...NEUTRAL_TALKS, offerFrom: "palmeiras-sp" }]) {
      const harder = byMonths(contractTerms(300_000, 36, mood));
      expect(harder[36]).toMatchObject({ stance: "agrees" });
      expect(harder[24]).toMatchObject({ stance: "hard" });
      expect(harder[36]?.wage).toBeGreaterThan(300_000);
    }
  });

  it("asks more in a low-morale squad and less in a happy one, and turns harder when morale sinks", () => {
    const low = byMonths(contractTerms(300_000, 36, { ...NEUTRAL_TALKS, morale: 20 }));
    const high = byMonths(contractTerms(300_000, 36, { ...NEUTRAL_TALKS, morale: 80 }));
    expect(low[36]?.wage).toBeGreaterThan(300_000);
    expect(high[36]?.wage).toBeLessThan(300_000);
    expect(low[36]?.stance).toBe("agrees");
    expect(high[36]?.stance).toBe("wants");
  });
});

describe("assistantPick", () => {
  it("takes the length nearest two years that the player agrees to", () => {
    expect(assistantPick(contractTerms(300_000, 36, NEUTRAL_TALKS))?.months).toBe(24);
    expect(assistantPick(contractTerms(300_000, 12, NEUTRAL_TALKS))?.months).toBe(24);
  });

  it("takes none when the player agrees to nothing", () => {
    const sour = { morale: 10, hasAskedToLeave: true, offerFrom: "abroad" };
    expect(assistantPick(contractTerms(300_000, 36, sour))).toBeNull();
  });
});
