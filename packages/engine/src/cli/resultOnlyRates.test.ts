import { describe, expect, it } from "vitest";
import { resultOnlyRates, TOLERANCE_STANDARD_ERRORS } from "./resultOnlyRates.js";

// 36 leagues give 13,680 matches a mode: a standard error of about 0.4 points on each result rate.
describe("result-only matches against the full pipeline", () => {
  it("score as many goals and win, draw and lose as often, within 3 standard errors", () => {
    const { matches, gaps } = resultOnlyRates(1, 36);
    expect(matches).toEqual({ full: 13_680, resultOnly: 13_680 });
    expect(gaps.map((gap) => gap.metric)).toEqual(["goals per match", "home wins", "draws", "away wins"]);
    for (const gap of gaps) expect(gap.standardErrors, gap.metric).toBeLessThan(TOLERANCE_STANDARD_ERRORS);
  }, 120_000);
});
