import { describe, expect, it } from "vitest";
import { loadTeams } from "../data/players.js";
import { CUP_PARAMS } from "./paramsForDivision.js";
import { realTwoLegTies, simulatedTwoLegTies } from "./twoLegTies.js";

describe("two-leg Copa do Brasil ties (2017–2025)", () => {
  const real = realTwoLegTies();
  const simulated = simulatedTwoLegTies({ A: loadTeams("A"), B: loadTeams("B"), C: loadTeams("C"), D: loadTeams("D") }, CUP_PARAMS);

  it("finds the cross-division two-leg ties and who went through", () => {
    expect(real.find((t) => t.gap === "AvB")?.ties).toBeGreaterThanOrEqual(60);
    for (const tie of real) expect(tie.favouriteOut).toBeGreaterThanOrEqual(0);
  });

  // Only A v B (64 ties), A v C (30) and A v D (25) have enough ties to test; the other gaps
  // have 1 to 9 and are only printed by `pnpm calibrate`.
  it.each(["AvB", "AvC", "AvD"] as const)("knocks the %s favourite out as often as real ties do, within 2.5 standard errors", (gap) => {
    const realTie = real.find((t) => t.gap === gap);
    const simTie = simulated.find((t) => t.gap === gap);
    if (!realTie || !simTie) throw new Error(`no ${gap} ties`);
    const standardError = Math.sqrt((simTie.favouriteOut * (1 - simTie.favouriteOut)) / realTie.ties);
    expect(Math.abs(realTie.favouriteOut - simTie.favouriteOut) / standardError).toBeLessThan(2.5);
  });
});
