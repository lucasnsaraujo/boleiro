import { describe, expect, it } from "vitest";
import { loadTeams } from "@boleiro/data/players";
import { DIVISION_GAPS, realCupUpsets, simulatedCupUpsets, type CupUpsetGroup } from "./cupUpsets.js";
import { CUP_PARAMS } from "./paramsForDivision.js";

const real = realCupUpsets();
const simulated = simulatedCupUpsets({ A: loadTeams("A"), B: loadTeams("B"), C: loadTeams("C"), D: loadTeams("D") }, CUP_PARAMS);

/** How many binomial standard errors (at the simulated rate) the real share sits from the simulated one. */
function standardErrors(simulatedShare: number, realShare: number, matches: number): number {
  return Math.abs(realShare - simulatedShare) / Math.sqrt((simulatedShare * (1 - simulatedShare)) / matches);
}

function pooled(groups: CupUpsetGroup[], weights: CupUpsetGroup[]): number {
  const matches = weights.reduce((sum, g) => sum + g.matches, 0);
  return groups.reduce((sum, g, i) => sum + (1 - g.win) * (weights[i]?.matches ?? 0), 0) / matches;
}

// Groups hold 13 to 155 real matches, so fixed tolerances like Série A's would be either
// meaningless or impossible. Each check allows a number of binomial standard errors instead.
describe("calibration against real Copa do Brasil upsets (2017–2025)", () => {
  it.each(DIVISION_GAPS)("has the %s favourite fail to win as often as in real ties, both venues together, within 2.5 standard errors", (gap) => {
    const realGroups = real.filter((g) => g.gap === gap);
    const simGroups = simulated.filter((g) => g.gap === gap);
    const matches = realGroups.reduce((sum, g) => sum + g.matches, 0);
    expect(standardErrors(pooled(simGroups, realGroups), pooled(realGroups, realGroups), matches)).toBeLessThan(2.5);
  });

  // Worst group: Série A away at Série B, 3.1 standard errors (real 53% wins, Boleiro 36%).
  // A symmetric home advantage cannot also fit A at home to B (69% real, 68% Boleiro).
  it.each(DIVISION_GAPS.flatMap((gap) => (["home", "away"] as const).map((venue) => [gap, venue] as const)))(
    "has the %s favourite win and lose about as often as in real ties when it plays %s, within 3.5 standard errors",
    (gap, venue) => {
      const realGroup = real.find((g) => g.gap === gap && g.venue === venue);
      const simGroup = simulated.find((g) => g.gap === gap && g.venue === venue);
      if (!realGroup || !simGroup) throw new Error(`no ${gap} ${venue} group`);
      expect(standardErrors(simGroup.win, realGroup.win, realGroup.matches)).toBeLessThan(3.5);
      expect(standardErrors(simGroup.loss, realGroup.loss, realGroup.matches)).toBeLessThan(3.5);
    },
  );

  it("lets favourites win clearly more at home than away, as in real ties", () => {
    for (const gap of DIVISION_GAPS) {
      const home = simulated.find((g) => g.gap === gap && g.venue === "home");
      const away = simulated.find((g) => g.gap === gap && g.venue === "away");
      expect((home?.win ?? 0) - (away?.win ?? 1), gap).toBeGreaterThan(0.15);
    }
  });
});
