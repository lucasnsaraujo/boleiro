import { describe, expect, it } from "vitest";
import { resultOnlyRates } from "./resultOnlyRates.js";

describe("result-only matches against the full pipeline", () => {
  it("score as many goals and win, draw and lose as often, within the engine's calibration tolerance", () => {
    const { matches, gaps } = resultOnlyRates(1, 36);
    expect(matches).toEqual({ full: 13_680, resultOnly: 13_680 });
    expect(gaps.map((gap) => [gap.metric, gap.tolerance])).toEqual([["goals per match", 0.1], ["home wins", 0.02], ["draws", 0.02], ["away wins", 0.02]]);
    for (const gap of gaps) expect(Math.abs(gap.full - gap.resultOnly), gap.metric).toBeLessThan(gap.tolerance);
  }, 120_000);
});
